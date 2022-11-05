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
  flattenAndValidateChannelArgs,
  makeSocketPath,
  splitDataIntoChunks,
} from "../util";

type OptionalArgs = Partial<
  Pick<GeneralRequestPayload, "query" | "headers" | "body">
>;

type PostAndPatchArg = Pick<GeneralRequestPayload, "body"> &
  Pick<GeneralRequestPayload, "query" | "headers">;

type MakeRequestObject_Argument = Partial<
  Omit<GeneralRequestPayload, "url" | "method">
> &
  Pick<GeneralRequestPayload, "url" | "method">;

export interface ExpressIPCClientInterface {
  request(arg: MakeRequestObject_Argument): Promise<GeneralResponsePayload>;
  get(url: string, otherArg?: OptionalArgs): Promise<GeneralResponsePayload>;
  post(url: string, otherArg: PostAndPatchArg): Promise<GeneralResponsePayload>;
  patch(
    url: string,
    otherArg: PostAndPatchArg
  ): Promise<GeneralResponsePayload>;
  delete(url: string, otherArg?: OptionalArgs): Promise<GeneralResponsePayload>;

  subscribe(
    ...channels: (string | string[])[]
  ): Promise<GeneralResponsePayload>;
  unsubscribe(
    ...channels: (string | string[])[]
  ): Promise<GeneralResponsePayload>;

  on(
    event: "broadcast",
    callback: (arg: { channel: string; data: object }) => any
  ): void;
}

export interface ExpressIPCClientConstructor_Argument {
  delimiter?: string;
  socketRoot?: string;
  path: Listen_Argument["path"];
}

type Query = {
  request: SocketRequest;
  promise: { reject: Function; resolve: Function };
};

const MANUAL_SOCKET_CLOSE_ERROR = new EPP({
  code: "SOCKET_DESTROYED_MANUALLY",
  message: `The underlying client socket has been destroyed manually.`,
});
Object.freeze(MANUAL_SOCKET_CLOSE_ERROR);

const SOCKET_ENDED_ERROR = new EPP({
  code: "socket_ended",
  message: `The socket has been ended by the server.`,
});
Object.freeze(SOCKET_ENDED_ERROR);

export class ExpressIPCClient
  extends EventEmitter
  implements ExpressIPCClientInterface
{
  readonly #path: string;
  readonly #delimiter: string;
  readonly #socketRoot: string;

  readonly #socket: Socket;
  readonly #queryQueue: Query[] = [];
  readonly #queriesWaitingForResponse: Map<string, Query> = new Map();

  #dataBuffer = "";
  #currentRequestId = 1;
  #socketEnded = false;
  #isSocketWritable = false;
  #isSendingRequests = false;

  constructor(arg: ExpressIPCClientConstructor_Argument) {
    super();

    this.#delimiter = arg.delimiter || "\f";
    validateDelimiter(this.#delimiter);

    this.#socketRoot = arg.socketRoot || tmpdir();
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

  #socketErrorHandler(error: any) {
    this.#socketEnded = true;
    this.#isSocketWritable = false;
    this.#removeSocketEventListeners(this.#socket);

    try {
      this.#socket.destroy();
    } catch {}

    this.#rejectAllRequests(error);
  }

  #rejectAllRequests(error: any) {
    for (const id of this.#queriesWaitingForResponse.keys()) {
      const query = this.#queriesWaitingForResponse.get(id)!;
      this.#queriesWaitingForResponse.delete(id);

      query.promise.reject(error);
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
        if (error) query.promise.reject(error);
        else
          this.#queriesWaitingForResponse.set(query.request.metadata.id, query);
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

    for (const response of serializedResponses)
      try {
        this.#handleResponse(JSON.parse(response));
      } catch (ex) {
        throw new EPP({
          code: "FATAL_ERROR:INVALID_RESPONSE",
          message:
            "Either we got betrayed by the server or we screwed up " +
            "somewhere! Invalid JSON response.",
        });
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

    if (!query)
      throw new EPP({
        code: "FATAL_ERROR:INVALID_RESPONSE",
        message: `The server returned response with an unknown request id.`,
      });

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

  async request(
    arg: MakeRequestObject_Argument
  ): Promise<GeneralResponsePayload> {
    const request = this.#makeRequestObject(arg);
    return this.#enqueueRequest(request);
  }

  async get(
    url: string,
    otherArg: OptionalArgs = {}
  ): Promise<GeneralResponsePayload> {
    const request = this.#makeRequestObject({
      url,
      method: "get",
      ...otherArg,
    });
    return this.#enqueueRequest(request);
  }

  async post(
    url: string,
    otherArg: PostAndPatchArg
  ): Promise<GeneralResponsePayload> {
    const request = this.#makeRequestObject({
      url,
      method: "post",
      ...otherArg,
    });
    return this.#enqueueRequest(request);
  }

  async patch(
    url: string,
    otherArg: PostAndPatchArg
  ): Promise<GeneralResponsePayload> {
    const request = this.#makeRequestObject({
      url,
      method: "patch",
      ...otherArg,
    });
    return this.#enqueueRequest(request);
  }

  async delete(
    url: string,
    otherArg?: OptionalArgs
  ): Promise<GeneralResponsePayload> {
    const request = this.#makeRequestObject({
      url,
      method: "delete",
      ...otherArg,
    });
    return this.#enqueueRequest(request);
  }

  #enqueueRequest(request: SocketRequest): Promise<GeneralResponsePayload> {
    if (this.#socketEnded) return Promise.reject(SOCKET_ENDED_ERROR);

    return new Promise((resolve, reject) => {
      const queueElement: Query = Object.freeze({
        request,
        promise: Object.freeze({ resolve, reject }),
      });

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

  close() {
    this.#socket.destroy(MANUAL_SOCKET_CLOSE_ERROR);
  }
}
