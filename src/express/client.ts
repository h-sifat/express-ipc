import type {
  SocketRequest,
  GeneralRequest,
  SocketResponse,
  GeneralRequestPayload,
  GeneralResponsePayload,
  SubscribeChannelsRequest,
  UnsubscribeChannelsRequest,
} from "../interface";
import type { Listen_Argument } from "../ipc-server/interface";

import { tmpdir } from "os";
import EventEmitter from "events";
import { createConnection, Socket } from "net";
import { validateDelimiter } from "../ipc-server/validator";
import {
  EPP,
  makeSocketPath,
  splitDataIntoChunks,
  flattenAndValidateChannelArgs,
} from "../util";
import { defaults } from "./defaults";
import { assert } from "handy-types";

interface RequestOptions {
  timeout?: number;
}

type OptionalArgs = Partial<
  Pick<GeneralRequestPayload, "query" | "headers" | "body">
> & { timeout?: number };

type PostAndPatchArg = Pick<GeneralRequestPayload, "body"> &
  Partial<Pick<GeneralRequestPayload, "query" | "headers">> & {
    timeout?: number;
  };

type MakeRequestObject_Argument = Partial<
  Omit<GeneralRequestPayload, "url" | "method">
> &
  Pick<GeneralRequestPayload, "url" | "method"> & {
    timeout?: number;
  };

export interface ExpressIPCClientConstructor_Argument {
  delimiter?: string;
  socketRoot?: string;
  path: Listen_Argument["path"];

  /**
   * Only used for testing. Don't provide this arg.
   * */
  clearTimeout?: (id: any) => void;
  /**
   * Only used for testing. Don't provide this arg.
   * */
  setTimeout?: (f: (...args: any[]) => any, duration: number) => number;
}

type Query = {
  request: SocketRequest;
  timeout?: { id?: any; duration: number };
  promise: { reject: Function; resolve: Function };
};

export const MANUAL_SOCKET_CLOSE_ERROR = new EPP({
  code: "SOCKET_DESTROYED_MANUALLY",
  message: `The underlying client socket has been destroyed manually.`,
});
Object.freeze(MANUAL_SOCKET_CLOSE_ERROR);

export const SOCKET_ENDED_ERROR = new EPP({
  code: "SOCKET_ENDED",
  message: `The socket has been ended by the server.`,
});
Object.freeze(SOCKET_ENDED_ERROR);

export const REQUEST_TIMEOUT_ERROR = new EPP({
  code: "REQUEST_TIMEOUT",
  message: `The request has timed out.`,
});

export class ExpressIPCClient extends EventEmitter {
  readonly #path: string;
  readonly #delimiter: string;
  readonly #socketRoot: string;

  readonly #socket: Socket;
  readonly #queryQueue: Query[] = [];
  readonly #queriesWaitingForResponse: Map<string, Query> = new Map();

  readonly #setTimeout: Required<ExpressIPCClientConstructor_Argument>["setTimeout"] =
    setTimeout;
  readonly #clearTimeout: Required<ExpressIPCClientConstructor_Argument>["clearTimeout"] =
    clearTimeout;

  #dataBuffer = "";

  // @warning don't set this to anything but 1. One of the test depends on it.
  #currentRequestId = 1;

  #socketEnded = false;
  #isSocketWritable = false;
  #isSendingRequests = false;

  constructor(arg: ExpressIPCClientConstructor_Argument) {
    super();

    this.#delimiter = arg.delimiter || defaults.delimiter;
    validateDelimiter(this.#delimiter);

    this.#socketRoot = arg.socketRoot || tmpdir();
    assert<string>("non_empty_string", this.#socketRoot, {
      name: "socketRoot",
      code: "INVALID_SOCKET_ROOT",
    });

    if (arg.setTimeout) this.#setTimeout = arg.setTimeout;
    if (arg.clearTimeout) this.#clearTimeout = arg.clearTimeout;

    this.#path = makeSocketPath({
      path: arg.path as any,
      socketRoot: this.#socketRoot,
    });

    this.#socket = this.#initializeSocket();
  }

  #initializeSocket() {
    const socket = createConnection({ path: this.#path }, () => {
      this.#isSocketWritable = true;
      this.#sendRequests();
    });

    this.#addSocketEventListeners(socket);
    return socket;
  }

  #addSocketEventListeners(socket: Socket) {
    socket.on("data", this.#handleIncomingData);
    socket.on("error", this.#socketErrorHandler);
    socket.on("end", () => this.#socketErrorHandler(SOCKET_ENDED_ERROR));
  }

  #removeSocketEventListeners(socket: Socket) {
    socket.removeAllListeners("end");
    socket.removeAllListeners("data");
    socket.removeAllListeners("error");
  }

  #socketErrorHandler = (error: any) => {
    this.#socketEnded = true;
    this.#isSocketWritable = false;
    this.#removeSocketEventListeners(this.#socket);

    try {
      this.#socket.destroy();
    } catch {}

    this.#rejectAllRequests(error);
    this.emit("socket_error", error);
  };

  #rejectAllRequests(error: any) {
    for (const id of this.#queriesWaitingForResponse.keys()) {
      const query = this.#queriesWaitingForResponse.get(id)!;
      this.#queriesWaitingForResponse.delete(id);

      query.promise.reject(error);
      if (query.timeout) clearTimeout(query.timeout.id);
    }

    while (this.#queryQueue.length) {
      const query = this.#queryQueue.shift()!;
      query.promise.reject(error);
    }
  }

  #sendRequests() {
    {
      const shouldNotSendRequests =
        !this.#isSocketWritable || this.#socketEnded || this.#isSendingRequests;

      if (shouldNotSendRequests) return;
    }

    this.#isSendingRequests = true;

    while (this.#queryQueue.length) {
      const query = this.#queryQueue.shift()!;

      let serializedRequest = "";

      try {
        serializedRequest = this.#serializeRequest(query.request);
      } catch (ex) {
        return query.promise.reject(ex);
      }

      this.#socket.write(serializedRequest, (error) => {
        if (error) return query.promise.reject(error);

        const queryId = query.request.metadata.id;
        this.#queriesWaitingForResponse.set(queryId, query);

        if (query.timeout) {
          query.timeout.id = this.#setTimeout(() => {
            this.#queriesWaitingForResponse.delete(queryId);
            query.promise.reject(REQUEST_TIMEOUT_ERROR);
          }, query.timeout.duration);
        }
      });
    }

    this.#isSendingRequests = false;
  }

  #handleIncomingData = (data: Buffer) => {
    this.#dataBuffer += data.toString("utf8");

    const { chunks: serializedResponses, residue } = splitDataIntoChunks({
      data: this.#dataBuffer,
      delimiter: this.#delimiter,
    });
    this.#dataBuffer = residue;

    for (const responseJSON of serializedResponses) {
      let response: SocketResponse;
      try {
        response = JSON.parse(responseJSON);
      } catch (ex) {
        const error = new EPP({
          code: "INVALID_RESPONSE:NOT_JSON",
          message:
            "Either we got betrayed by the server or we screwed up " +
            "somewhere! Invalid JSON response.",
        });

        this.emit("error", error);
        continue;
      }

      this.#handleResponse(response);
    }
  };

  #handleResponse(response: SocketResponse) {
    if (response.metadata.category === "broadcast") {
      this.emit("broadcast", {
        data: response.payload,
        channel: response.metadata.channel,
      });

      return;
    }

    const id = response.metadata.id;
    const query = this.#queriesWaitingForResponse.get(id);
    this.#queriesWaitingForResponse.delete(id);

    if (!query) {
      const error = new EPP({
        code: "INVALID_RESPONSE:UNKNOWN_ID",
        message:
          `The server returned response with an unknown request id.` +
          ` Probably the request timed out?`,
      });
      this.emit("unhandled_response", { response, responseId: id, error });

      return;
    }

    if (query.timeout) this.#clearTimeout(query.timeout.id);

    if (response.metadata.isError) query.promise.reject(response.payload);
    else query.promise.resolve(response.payload);
  }

  subscribe(
    ...channelsRestArg: (string | string[])[]
  ): Promise<GeneralResponsePayload> {
    const channels = flattenAndValidateChannelArgs(channelsRestArg);

    const request: SubscribeChannelsRequest = {
      payload: Object.freeze({ channels }),
      metadata: Object.freeze({ id: this.#getNewId(), category: "subscribe" }),
    };

    return this.#enqueueRequest(request);
  }

  unsubscribe(
    ...channelsRestArg: (string | string[])[]
  ): Promise<GeneralResponsePayload> {
    const channels = flattenAndValidateChannelArgs(channelsRestArg);

    const request: UnsubscribeChannelsRequest = {
      payload: Object.freeze({ channels }),
      metadata: Object.freeze({
        id: this.#getNewId(),
        category: "unsubscribe",
      }),
    };

    return this.#enqueueRequest(request);
  }

  async request<BodyType = any>(
    arg: MakeRequestObject_Argument,
    options: RequestOptions = {}
  ): Promise<GeneralResponsePayload<BodyType>> {
    const request = this.#makeRequestObject(arg);

    if ("timeout" in options) {
      const { timeout } = options;
      assert<number>("non_negative_number", timeout, { name: "timeout" });

      return this.#enqueueRequest(request, { timeoutDuration: timeout });
    } else return this.#enqueueRequest(request);
  }

  async get<BodyType = any>(
    url: string,
    otherArg: OptionalArgs = {}
  ): Promise<GeneralResponsePayload<BodyType>> {
    const requestOptions: RequestOptions = {};
    if (otherArg.timeout) requestOptions.timeout = otherArg.timeout;

    return this.request({ url, method: "get", ...otherArg }, requestOptions);
  }

  async post<BodyType = any>(
    url: string,
    otherArg: PostAndPatchArg
  ): Promise<GeneralResponsePayload<BodyType>> {
    const requestOptions: RequestOptions = {};
    if (otherArg.timeout) requestOptions.timeout = otherArg.timeout;

    return this.request({ url, method: "post", ...otherArg }, requestOptions);
  }

  async patch<BodyType = any>(
    url: string,
    otherArg: PostAndPatchArg
  ): Promise<GeneralResponsePayload<BodyType>> {
    const requestOptions: RequestOptions = {};
    if (otherArg.timeout) requestOptions.timeout = otherArg.timeout;

    return this.request({ url, method: "patch", ...otherArg }, requestOptions);
  }

  async delete<BodyType = any>(
    url: string,
    otherArg: OptionalArgs = {}
  ): Promise<GeneralResponsePayload<BodyType>> {
    const requestOptions: RequestOptions = {};
    if (otherArg.timeout) requestOptions.timeout = otherArg.timeout;

    return this.request({ url, method: "delete", ...otherArg }, requestOptions);
  }

  #enqueueRequest(
    request: SocketRequest,
    options: { timeoutDuration?: number } = {}
  ): Promise<GeneralResponsePayload> {
    if (this.#socketEnded) return Promise.reject(SOCKET_ENDED_ERROR);

    return new Promise((resolve, reject) => {
      const queueElement: Query = {
        request,
        promise: Object.freeze({ resolve, reject }),
      };

      if (options.timeoutDuration)
        queueElement.timeout = { duration: options.timeoutDuration };

      Object.freeze(queueElement);

      this.#queryQueue.push(queueElement);
      this.#sendRequests();
    });
  }

  #getNewId() {
    return String(this.#currentRequestId++);
  }

  #serializeRequest(request: SocketRequest) {
    const serialized = JSON.stringify(request);

    if (serialized.includes(this.#delimiter)) {
      const message =
        `The request object should not contain any value or property that ` +
        `contains the delimiter (code: ${this.#delimiter.charCodeAt(
          0
        )}) character.`;

      throw new EPP({ message, code: "DELIMITER_IN_REQUEST" });
    }

    return serialized + this.#delimiter;
  }

  #makeRequestObject(arg: MakeRequestObject_Argument): GeneralRequest {
    const id = this.#getNewId();
    const { url, method, body = null, headers = {}, query = {} } = arg;

    return Object.freeze({
      metadata: Object.freeze({ id, category: "general" }),
      payload: Object.freeze({ url, method, body, headers, query }),
    });
  }

  on(
    event: "broadcast",
    cb: (arg: { data: any; channel: string }) => void
  ): this;
  on(event: "socket_error", cb: (error: Error) => void): this;
  on(
    event: "unhandled_response",
    cb: (data: {
      error: EPP;
      responseId: number;
      response: GeneralResponsePayload;
    }) => void
  ): this;
  on(event: "error", cb: (error: Error) => void): this;
  on(event: string, cb: (...data: any[]) => void) {
    super.on(event, cb);
    return this;
  }

  close() {
    this.#socket.destroy(MANUAL_SOCKET_CLOSE_ERROR);
  }
}
