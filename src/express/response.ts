import { EPP } from "../util";

import type { GeneralRequest, PlainObject } from "../interface";
import type { ResponseInterface } from "./interface";
import type { IPC_ServerInterface } from "../ipc-server/interface";

export class Response implements ResponseInterface {
  #isSent = false;
  readonly #connectionId: number;
  readonly #metadata: GeneralRequest["metadata"];
  readonly #sendResponse: IPC_ServerInterface["sendResponse"];
  readonly #headers: PlainObject<any> = {};

  constructor(arg: {
    connectionId: number;
    metadata: GeneralRequest["metadata"];
    sendResponse: IPC_ServerInterface["sendResponse"];
  }) {
    this.#metadata = arg.metadata;
    this.#connectionId = arg.connectionId;
    this.#sendResponse = arg.sendResponse;
  }

  send(
    body: object | null = null,
    options?: { type?: "json"; endConnection?: false; isError?: boolean }
  ) {
    this.#assertResponseNotSent();

    const { endConnection = false, isError = false } = options || {};

    this.#sendResponse({
      endConnection,
      response: {
        payload: { headers: this.#headers, body: body },
        metadata: { ...this.#metadata, isError },
      },
      connectionId: this.#connectionId,
    });

    this.#isSent = true;
  }

  #assertResponseNotSent() {
    if (this.#isSent)
      throw new EPP({
        code: "RESPONSE_ALREADY_SENT",
        message: `The response is already sent.`,
      });
  }

  get isSent() {
    return this.#isSent;
  }

  get headers() {
    return this.#headers;
  }
}
