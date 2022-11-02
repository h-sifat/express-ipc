import type {
  SocketRequest,
  PrimaryGeneralRequest,
  SubscribeChannelsRequest,
  UnsubscribeChannelsRequest,
} from "../interface";
import { EPP } from "../util";
import { assert } from "handy-types";
import type { Server, Socket } from "net";

export type IPC_Server_Interface = InstanceType<
  ReturnType<typeof makeIPC_ServerClass>
>;

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

export type GeneralResponse = ConnectionId & { type: "general" } & (
    | { data: object; error: null }
    | { data: null; error: object }
  );

export type BroadcastResponse = ConnectionId & {
  data: object;
  channel: string;
  type: "broadcast";
};

export type SendResponse_Argument = { endConnection?: boolean } & (
  | GeneralResponse
  | BroadcastResponse
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
  request: PrimaryGeneralRequest;
}

export interface IPC_ServerConstructor_Argument {
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

export interface MakeIPC_ServerClass_Argument {
  getSocketRoot(): string;
  resolvePath(...paths: string[]): string;
  deleteSocketFile(socketPath: string): void;
  getSocketPath(arg: MakeSocketPath_Argument): string;
  createServer(callback: (socket: Socket) => void): Server;
  validateRequest(request: any): asserts request is SocketRequest;
}

export function makeIPC_ServerClass(builderArg: MakeIPC_ServerClass_Argument) {
  const {
    resolvePath,
    createServer,
    getSocketPath,
    getSocketRoot,
    deleteSocketFile,
  } = builderArg;
  const validateRequest: MakeIPC_ServerClass_Argument["validateRequest"] =
    builderArg.validateRequest;

  return class IPC_Server {
    readonly #server: Server;
    readonly #connections: { [key: number]: Connection } = {};
    readonly #channels: Set<string> = new Set();

    readonly #DELIMITER: string;
    readonly #socketRoot: string;
    readonly #requestHandler: IPC_ServerConstructor_Argument["requestHandler"];

    #currentId = 1;
    #socketPath: string | undefined;

    constructor(arg: IPC_ServerConstructor_Argument) {
      this.#DELIMITER = arg.delimiter;

      assert<string>("non_empty_string", this.#DELIMITER, {
        name: "delimiter",
        code: "INVALID_DELIMITER",
      });

      if (this.#DELIMITER.length !== 1)
        throw new EPP({
          code: "INVALID_DELIMITER:NOT_CHAR",
          message: `The "delimiter" must be a single character.`,
        });

      assert<IPC_ServerConstructor_Argument["requestHandler"]>(
        "function",
        arg.requestHandler,
        {
          name: "requestHandler",
          code: "INVALID_REQUEST_HANDLER",
        }
      );

      this.#requestHandler = arg.requestHandler;

      this.#socketRoot = arg.socketRoot
        ? resolvePath(arg.socketRoot)
        : getSocketRoot();

      assert<string>("non_empty_string", this.#socketRoot, {
        name: "socketRoot",
        code: "INVALID_SOCKET_ROOT",
      });

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

      connection.__dataBuffer += receivedData;

      const requests = connection.__dataBuffer.split(this.#DELIMITER);

      // meaning that the current request's incoming data hasn't terminated yet.
      if (requests.length <= 1) return;

      // the last element holds the most recent request's
      // unterminated data or an empty string (""). so assign it back to
      // the __dataBuffer.
      connection.__dataBuffer = requests.pop()!;

      for (const rawRequestData of requests)
        this.#validateAndRouteRequest({ connectionId, data: rawRequestData });
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
          error: null,
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
          this.#requestHandler({ connectionId, request });
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
        error: null,
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
        error: null,
        connectionId,
        type: "general",
        data: { message: `Unsubscribed from channels: ${channels.join(", ")}` },
      });
    }

    listen = (
      arg: ({ path: string } | { namespace: string; id: string }) & {
        callback?: () => void;
        deleteSocketBeforeListening?: boolean;
      }
    ) => {
      const socketPath = (() => {
        if ("path" in arg) return arg.path;
        return getSocketPath({
          id: arg.id,
          namespace: arg.namespace,
          socketRoot: this.#socketRoot,
        });
      })();

      if (arg.deleteSocketBeforeListening) deleteSocketFile(socketPath);

      this.#server.listen(socketPath, arg.callback || (() => {}));
      this.#socketPath = socketPath;
    };

    on = (event: string, listener: (...args: any[]) => void) => {
      this.#server.on(event, listener);
    };

    close = (callback: (err?: Error | null) => void = () => {}) => {
      this.#server.close(callback);

      if (this.#socketPath) deleteSocketFile(this.#socketPath);
      this.#socketPath = undefined;
    };

    broadcast = (arg: { channel: string; data: object }) => {
      const { channel, data } = arg;

      if (!this.#channels.has(channel))
        throw new EPP({
          code: "UNKNOWN_CHANNEL",
          message: `No channel exists with the name: "${channel}"`,
        });

      assert<object>("non_null_object", data, {
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
    };

    sendResponse = (arg: SendResponse_Argument) => {
      const connection = this.#connections[arg.connectionId];
      if (!connection) return;

      if (!VALID_RESPONSE_TYPES.includes(arg.type))
        throw new EPP({
          code: "INVALID_RESPONSE_TYPE",
          message: `Invalid response type: "${arg.type}"`,
        });

      const dataToSend = (() => {
        const { data, type } = arg;

        if (type === "broadcast") {
          assert<object>("non_null_object", data, {
            name: `Response data`,
            code: `INVALID_RESPONSE_DATA`,
          });
          return { data, type, channel: arg.channel };
        }

        const { error } = arg;

        /**
         * data | error | isValid
         * -----|-------|--------
         *  object | null | `true`
         *  null | object | `true`
         *  null | null | `false`
         *  object | object | `false`
         * */
        const isValidDataAndErrorCombination = Boolean(
          Number(data === null) ^ Number(error === null)
        );

        if (!isValidDataAndErrorCombination)
          throw new EPP({
            code: "INVALID_DATA_ERROR_COMBINATION",
            message:
              `The "data" and "error" property must have alternating value.` +
              ` Both cannot be null or defined at the same time.`,
          });

        if (data)
          assert<object>("non_null_object", data, {
            name: `Response data`,
            code: `INVALID_RESPONSE_DATA`,
          });
        else
          assert<object>("plain_object", error, {
            name: `Response error`,
            code: `INVALID_RESPONSE_ERROR`,
          });

        return { data, error, type };
      })();

      const serializedData = JSON.stringify(dataToSend);

      if (serializedData.includes(this.#DELIMITER))
        throw new EPP({
          code: "DELIMITER_IN_RESPONSE",
          message:
            `The response object must not contain any value or property ` +
            `that contains the delimiter character.`,
        });

      try {
        connection.socket.write(serializedData + this.#DELIMITER, (_error) => {
          // I don't know what to do with the error.
          // At this point I'm literally becoming crazy 😫

          if (arg.endConnection) connection.socket.end();
        });
      } catch {}
    };
  };
}
