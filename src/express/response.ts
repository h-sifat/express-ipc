import { EPP } from "../util";
import type { ResponseInterface } from "./interface";
import type { IPC_Server_Interface } from "../ipc-server/ipc-server";

export class Response implements ResponseInterface {
  #isSent = false;
  #connectionId: number;
  #sendResponse: IPC_Server_Interface["sendResponse"];

  constructor(arg: {
    sendResponse: IPC_Server_Interface["sendResponse"];
    connectionId: number;
  }) {
    this.#sendResponse = arg.sendResponse;
    this.#connectionId = arg.connectionId;
  }

  send(
    dataOrError: object,
    options?: { type?: "json"; endConnection?: false; isError?: boolean }
  ) {
    this.#assertResponseNotSent();

    const { endConnection = false, isError = false } = options || {};

    this.#sendResponse({
      endConnection,
      type: "general",
      connectionId: this.#connectionId,
      ...(isError
        ? { error: dataOrError, data: null }
        : { data: dataOrError, error: null }),
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
}
