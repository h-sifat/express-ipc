import type {
  ConnectionId,
  IPC_ServerClass,
  Listen_Argument,
  IPC_ServerInterface,
  SendResponse_Argument,
  IPC_ServerConstructor_Argument,
} from "./interface";
import type {
  SocketRequest,
  SubscribeChannelsRequest,
  UnsubscribeChannelsRequest,
} from "../interface";

import { EPP } from "../util";
import { assert } from "handy-types";
import type { Server, Socket } from "net";

export const VALID_REQUEST_CATEGORIES = Object.freeze([
  "general",
  "subscribe",
  "unsubscribe",
] as const);

export const VALID_RESPONSE_CATEGORIES = Object.freeze([
  "broadcast",
  ...VALID_REQUEST_CATEGORIES,
] as const);

export const VALID_REQUEST_METHODS = Object.freeze([
  "get",
  "post",
  "delete",
  "patch",
] as const);

interface Connection {
  id: number;
  socket: Socket;
  __dataBuffer: string;
  channels: Set<string>;
}

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
  validateRequestMetadata(
    metadata: unknown
  ): asserts metadata is SocketRequest["metadata"];

  validateRequestPayload(
    payload: unknown,
    category: SocketRequest["metadata"]["category"]
  ): asserts payload is SocketRequest["payload"];

  deleteSocketFile(socketPath: string): void;
  getSocketPath(arg: MakeSocketPath_Argument): string;
  createServer(callback: (socket: Socket) => void): Server;
}

export function makeIPC_ServerClass(
  builderArg: MakeIPC_ServerClass_Argument
): IPC_ServerClass {
  const { createServer, getSocketPath, deleteSocketFile } = builderArg;

  const validateRequestPayload: MakeIPC_ServerClass_Argument["validateRequestPayload"] =
    builderArg.validateRequestPayload;
  const validateRequestMetadata: MakeIPC_ServerClass_Argument["validateRequestMetadata"] =
    builderArg.validateRequestMetadata;

  return class IPC_Server implements IPC_ServerInterface {
    readonly #server: Server;
    readonly #channels: Set<string> = new Set();
    readonly #connections: { [key: number]: Connection } = {};

    readonly #DELIMITER: string;
    readonly #socketRoot: string;
    readonly #generalRequestHandler: IPC_ServerConstructor_Argument["requestHandler"];

    #currentId = 1;
    #socketPath: string | undefined;

    readonly #requestHandlersByCategory = Object.freeze({
      general: (arg: any) => this.#generalRequestHandler(arg),
      subscribe: (arg: any) => this.#subscribeRequestHandler(arg),
      unsubscribe: (arg: any) => this.#unsubscribeRequestHandler(arg),
    } as const);

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

      this.#socketRoot = arg.socketRoot;
      assert<string>("non_empty_string", this.#socketRoot, {
        name: "socketRoot",
        code: "INVALID_SOCKET_ROOT",
      });

      this.#generalRequestHandler = arg.requestHandler;

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
      data,
      connectionId,
    }: ConnectionId & { data: string }) {
      const connection = this.#connections[connectionId];
      if (!connection) return;

      let request: SocketRequest;
      try {
        request = JSON.parse(data);
        validateRequestMetadata(request?.metadata);
      } catch (ex) {
        this.sendResponse({
          connectionId,
          response: {
            payload: {
              headers: {},
              body: { message: ex.message, code: ex.code || "" },
            },
            metadata: { id: "unknown", category: "general", isError: true },
          },
        });
        return;
      }

      try {
        validateRequestPayload(request.payload, request.metadata.category);
      } catch (ex) {
        this.sendResponse({
          connectionId,
          response: {
            metadata: { ...request.metadata, isError: true },
            payload: {
              headers: {},
              body: { message: ex.message, code: ex.code || "" },
            },
          },
        });
        return;
      }

      this.#requestHandlersByCategory[request.metadata.category]({
        request,
        connectionId,
      });
    }

    #subscribeRequestHandler(
      arg: ConnectionId & { request: SubscribeChannelsRequest }
    ) {
      const { connectionId, request } = arg;

      const connection = this.#connections[connectionId];
      if (!connection) return;

      for (const channel of request.payload.channels)
        if (this.#channels.has(channel)) connection.channels.add(channel);

      const message =
        `Subscribed to channels: ` + `${request.payload.channels.join(", ")}`;
      this.sendResponse({
        connectionId,
        response: {
          payload: { headers: {}, body: { message } },
          metadata: { ...request.metadata, isError: false },
        },
      });
    }

    #unsubscribeRequestHandler(
      arg: ConnectionId & { request: UnsubscribeChannelsRequest }
    ) {
      const { connectionId, request } = arg;

      const connection = this.#connections[connectionId];
      if (!connection) return;

      request.payload.channels.forEach((channel) =>
        connection.channels.delete(channel)
      );

      const message =
        `Unsubscribed from channels: ` +
        `${request.payload.channels.join(", ")}`;

      this.sendResponse({
        connectionId,
        response: {
          payload: { body: { message }, headers: {} },
          metadata: { ...request.metadata, isError: false },
        },
      });
    }

    listen = (arg: Listen_Argument) => {
      const socketPath = (() => {
        const { path } = arg;
        return typeof path === "string"
          ? path
          : getSocketPath({
              id: path.id,
              namespace: path.namespace,
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
            connectionId: connection.id,
            response: {
              payload: data,
              metadata: { channel, category: "broadcast" },
            },
          });
    };

    sendResponse = (arg: SendResponse_Argument) => {
      const connection = this.#connections[arg.connectionId];
      if (!connection) return;

      const { response } = arg;
      if (!VALID_RESPONSE_CATEGORIES.includes(response.metadata.category))
        throw new EPP({
          code: "INVALID_RESPONSE_CATEGORY",
          message: `Invalid response category: "${response.metadata.category}"`,
        });

      assert<object>("non_null_object", response.payload, {
        name: "Response payload",
        code: "INVALID_RESPONSE_PAYLOAD",
      });

      const serializedData = JSON.stringify(response);

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
