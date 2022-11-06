import type {
  MiddleWare,
  RouteObject,
  RouteHandlerGroup,
  RouteHandlersRegister,
  MiddlewareRestParameter,
} from "./interface";
import type {
  IPC_ServerInterface,
  RequestHandler_Argument,
  IPC_ServerConstructor_Argument,
} from "../ipc-server/interface";
import type { GeneralRequestPayload } from "../interface";

import os from "os";

import { Response } from "./response";
import { IPC_Server } from "../ipc-server";
import { routeRequestToRouteGroup } from "./request-router";
import { isErrorMiddleware, normalizeRawRequest } from "../util";
import { registerRouteHandlers, RouteHandlerRegistrar } from "./registrar";
import { defaults } from "./defaults";

export type ExpressConstructor_Argument = Omit<
  Partial<IPC_ServerConstructor_Argument>,
  "requestHandler"
>;

export class ExpressIPCServer extends RouteHandlerRegistrar {
  readonly #server: IPC_ServerInterface;
  readonly #register: RouteHandlersRegister;
  readonly #appLevelRoute: RouteObject = Object.freeze({
    path: "/",
    errorHandlers: [],
    generalHandlers: [],
    matcher: () => ({ path: "/", params: {} }),
  });

  readonly on: IPC_ServerInterface["on"];
  readonly close: IPC_ServerInterface["close"];
  readonly listen: IPC_ServerInterface["listen"];
  readonly broadcast: IPC_ServerInterface["broadcast"];
  readonly createChannels: IPC_ServerInterface["createChannels"];
  readonly deleteChannels: IPC_ServerInterface["deleteChannels"];

  constructor(arg: ExpressConstructor_Argument = {}) {
    const register = Object.freeze({
      use: {},
      all: {},
      get: {},
      post: {},
      patch: {},
      delete: {},
    });

    super({ register, isErrorMiddleware });
    this.#register = register;

    this.#server = new IPC_Server({
      requestHandler: this.#requestHandler,
      socketRoot: arg.socketRoot || os.tmpdir(),
      delimiter: arg.delimiter || defaults.delimiter,
    });

    this.on = this.#server.on;
    this.close = this.#server.close;
    this.listen = this.#server.listen;
    this.broadcast = this.#server.broadcast;
    this.createChannels = this.#server.createChannels;
    this.deleteChannels = this.#server.deleteChannels;
  }

  #requestHandler = (arg: RequestHandler_Argument) => {
    const { connectionId, request } = arg;

    const expressResponse = new Response({
      connectionId,
      metadata: request.metadata,
      sendResponse: this.#server.sendResponse,
    });

    const expressRequest = normalizeRawRequest({ rawRequest: request.payload });

    routeRequestToRouteGroup({
      req: expressRequest,
      res: expressResponse,
      getRouteGroup: this.getRouteGroupStack({
        method: request.payload.method,
      }),
    });
  };

  *getRouteGroupStack(arg: {
    method: GeneralRequestPayload["method"];
  }): Generator<RouteHandlerGroup> {
    const { method } = arg;
    yield { "/": this.#appLevelRoute };
    for (const group of ["use", "all", method]) yield this.#register[group];
  }

  override use(
    firstArg: string | MiddleWare | MiddleWare[],
    ...handlers: MiddlewareRestParameter
  ) {
    if (typeof firstArg !== "string") {
      registerRouteHandlers({
        isErrorMiddleware,
        route: this.#appLevelRoute,
        handlers: [firstArg, ...handlers],
      });

      return;
    }

    super.use(firstArg, ...handlers);
  }

  get socketPath() {
    return this.#server.socketPath;
  }
}
