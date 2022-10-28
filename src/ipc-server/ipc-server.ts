import type {
  SocketRequest,
  PrimaryGeneralRequest,
  SubscribeChannelsRequest,
  UnsubscribeChannelsRequest,
} from "../interface";
import type { Server, Socket } from "net";
import { EPP } from "../util";
import { assert } from "handy-types";

export const VALID_REQUEST_TYPES = Object.freeze([
  "general",
  "subscribe",
  "unsubscribe",
] as const);

export const VALID_REQUEST_METHODS = Object.freeze([
  "get",
  "post",
  "delete",
  "patch",
] as const);

export const VALID_RESPONSE_TYPES = Object.freeze([
  "general",
  "broadcast",
] as const);

type SendResponse_Argument = ConnectionId & { data: object } & (
    | { type: "general" }
    | { type: "broadcast"; channel: string }
  );

interface ConnectionId {
  connectionId: number;
}

interface Connection {
  id: number;
  socket: Socket;
  __dataBuffer: string;
  channels: Set<string>;
}

export interface RequestHandler_Argument {
  connectionId: number;
  socket: Socket;
  request: PrimaryGeneralRequest;
}

interface IPC_ServerConstructor_Argument {
  delimiter: string;
  socketRoot?: string;
  requestHandler(arg: RequestHandler_Argument): void;
}

type SubscribeUnsubscribe_Argument = ConnectionId & {
  request: SubscribeChannelsRequest | UnsubscribeChannelsRequest;
};

interface HandleIncomingData_Argument {
  connectionId: number;
  receivedData: string;
}

export interface MakeSocketPath_Argument {
  id: string;
  namespace: string;
  socketRoot: string;
}

interface MakeIPC_ServerClass_Argument {
  getSocketRoot(): string;
  resolvePath(...paths: string[]): string;
  createServer(callback: (socket: Socket) => void): Server;
  rmSync(path: string, options?: { force: boolean }): void;
  makeSocketPath(arg: MakeSocketPath_Argument): string;
  validateRequest(request: any): asserts request is SocketRequest;
}

export default function makeIPC_ServerClass(
  builderArg: MakeIPC_ServerClass_Argument
) {
  const { rmSync, resolvePath, createServer, getSocketRoot, makeSocketPath } =
    builderArg;
  const validateRequest: MakeIPC_ServerClass_Argument["validateRequest"] =
    builderArg.validateRequest;

  return class IPC_Server {
    readonly #server: Server;
    readonly #connections: { [key: number]: Connection } = {};
    readonly #channels: Set<string> = new Set();

    readonly #socketRoot: string;
    readonly #DELIMITER: IPC_ServerConstructor_Argument["delimiter"];
    readonly #requestHandler: IPC_ServerConstructor_Argument["requestHandler"];

    #currentId = 1;

    constructor(arg: IPC_ServerConstructor_Argument) {
      this.#DELIMITER = arg.delimiter;
      this.#requestHandler = arg.requestHandler;
      this.#socketRoot = arg.socketRoot
        ? resolvePath(arg.socketRoot)
        : getSocketRoot();

      // initialize server
      this.#server = createServer((connection) => {
        const id = this.#currentId++;
        this.#connections[id] = {
          id,
          __dataBuffer: "",
          socket: connection,
          channels: new Set(),
        };

        connection.setEncoding("utf8");

        connection.on("data", (buffer) =>
          this.#handleIncomingData({
            connectionId: id,
            receivedData: buffer.toString(),
          })
        );

        connection.on("end", () => this.#removeConnection(id));
        connection.on("close", () => this.#removeConnection(id));
        connection.on("error", () => this.#removeConnection(id));
      });

      this.#server.on("error", (error) => {
        try {
          this.#server.close();
        } catch {}
        throw error;
      });
    }

    createChannels(channels: string[]) {
      for (const channel of channels) this.#channels.add(channel);
    }

    deleteChannels(channels: string[]) {
      for (const channel of channels) this.#channels.delete(channel);
    }

    #handleIncomingData({
      connectionId,
      receivedData,
    }: HandleIncomingData_Argument) {
      const connection = this.#connections[connectionId];
      if (!connection) return;

      const delimiterIdx = receivedData.indexOf(this.#DELIMITER);
      if (delimiterIdx === -1) {
        connection.__dataBuffer += receivedData;
        return;
      }

      connection.__dataBuffer += receivedData.slice(0, delimiterIdx);
      this.#validateAndRouteRequest({
        connectionId,
        data: connection.__dataBuffer,
      });
      connection.__dataBuffer = receivedData.slice(delimiterIdx + 1);
    }

    #removeConnection(id: number) {
      const connection = this.#connections[id];
      if (!connection) return;

      delete this.#connections[id];
      try {
        connection.socket.destroy();
      } catch {}
    }

    #validateAndRouteRequest({
      connectionId,
      data,
    }: ConnectionId & { data: string }) {
      const connection = this.#connections[connectionId];
      if (!connection) return;

      let request: SocketRequest;
      try {
        request = JSON.parse(data);
        validateRequest(request);
      } catch (ex) {
        this.sendResponse({
          connectionId,
          type: "general",
          data: { error: ex.message },
        });

        return;
      }

      switch (request.type) {
        case "subscribe":
          this.#subscribeRequestHandler({ connectionId, request });
          return;
        case "unsubscribe":
          this.#unsubscribeRequestHandler({ connectionId, request });
          return;

        default:
          this.#requestHandler({
            connectionId,
            socket: connection.socket,
            request,
          });
      }
    }

    #subscribeRequestHandler(arg: SubscribeUnsubscribe_Argument) {
      const { connectionId } = arg;
      const { channels } = arg.request;

      const connection = this.#connections[connectionId];
      if (!connection) return;

      for (const channel of channels)
        if (this.#channels.has(channel)) connection.channels.add(channel);

      this.sendResponse({
        connectionId,
        type: "general",
        data: { message: `Subscribed to channels: ${channels.join(", ")}` },
      });
    }

    #unsubscribeRequestHandler(arg: SubscribeUnsubscribe_Argument) {
      const { connectionId } = arg;
      const { channels } = arg.request;

      const connection = this.#connections[connectionId];
      if (!connection) return;

      channels.forEach((channel) => connection.channels.delete(channel));

      this.sendResponse({
        connectionId,
        type: "general",
        data: { message: `Unsubscribed from channels: ${channels.join(", ")}` },
      });
    }

    listen(
      arg: ({ path: string } | { namespace: string; id: string }) & {
        callback?: () => void;
        deleteSocketIfExists?: boolean;
      }
    ) {
      const socketPath = (() => {
        if ("path" in arg) return arg.path;
        return makeSocketPath({
          id: arg.id,
          namespace: arg.namespace,
          socketRoot: this.#socketRoot,
        });
      })();

      if (arg.deleteSocketIfExists) rmSync(socketPath, { force: true });

      this.#server.listen(socketPath, arg.callback || (() => {}));
    }

    on(event: string, listener: (...args: any[]) => void) {
      this.#server.on(event, listener);
    }

    close(callback: (err?: Error | null) => void = () => {}) {
      this.#server.close(callback);
    }

    broadcast(arg: { channel: string; data: object }) {
      const { channel, data } = arg;

      if (!this.#channels.has(channel))
        throw new EPP({
          code: "UNKNOWN_CHANNEL",
          message: `No channel exists with the name: "${channel}"`,
        });

      assert<object>("plain_object", data, {
        name: "Broadcast data",
        code: "INVALID_BROADCAST_DATA",
      });

      for (const connection of Object.values(this.#connections) as Connection[])
        if (connection.channels.has(channel))
          this.sendResponse({
            data,
            channel,
            type: "broadcast",
            connectionId: connection.id,
          });
    }

    sendResponse(arg: SendResponse_Argument) {
      const { connectionId, type, data } = arg;

      const connection = this.#connections[connectionId];
      if (!connection) return;

      if (!VALID_RESPONSE_TYPES.includes(type))
        throw new EPP({
          code: "INVALID_RESPONSE_TYPE",
          message: `Invalid response type: "${type}"`,
        });

      assert<object>("plain_object", data, {
        name: "Response data",
        code: "INVALID_RESPONSE_DATA",
      });

      const dataToSend =
        type === "broadcast"
          ? { data, type, channel: arg.channel }
          : { data, type };

      const serializedData = JSON.stringify(dataToSend) + this.#DELIMITER;

      try {
        connection.socket.write(serializedData);
      } catch {}
    }
  };
}
