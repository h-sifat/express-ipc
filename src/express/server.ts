import type {
  MiddleWare,
  RouteObject,
  RouteHandlerGroup,
  RouteHandlersRegister,
  MiddlewareRestParameter,
} from "./interface";
import type {
  IPC_Server_Interface,
  RequestHandler_Argument,
  IPC_ServerConstructor_Argument,
} from "../ipc-server/ipc-server";
import type { PrimaryGeneralRequest } from "../interface";

import { Response } from "./response";
import { IPC_Server } from "../ipc-server";
import { normalizeRawRequest } from "../util";
import { routeRequestToRouteGroup } from "./request-router";
import { registerRouteHandlers, RouteHandlerRegistrar } from "./registrar";

export type ExpressConstructor_Argument = Omit<
  Partial<IPC_ServerConstructor_Argument>,
  "requestHandler"
>;

const ERROR_HANDLER_FLAG = Symbol();

export class ExpressIPCServer extends RouteHandlerRegistrar {
  readonly #server: IPC_Server_Interface;
  readonly #register: RouteHandlersRegister;
  readonly #appLevelRoute: RouteObject = Object.freeze({
    path: "/",
    errorHandlers: [],
    generalHandlers: [],
    matcher: () => ({ path: "/", params: {} }),
  });

  readonly on: IPC_Server_Interface["on"];
  readonly close: IPC_Server_Interface["close"];
  readonly listen: IPC_Server_Interface["listen"];
  readonly broadcast: IPC_Server_Interface["broadcast"];

  constructor(arg: ExpressConstructor_Argument) {
    const register = Object.freeze({
      use: {},
      all: {},
      get: {},
      post: {},
      patch: {},
      delete: {},
    });

    super({ register, ERROR_HANDLER_FLAG });
    this.#register = register;

    {
      const serverArg: any = {
        delimiter: arg.delimiter || "\f",
        requestHandler: this.#rawRequestHandler,
      };
      if ("socketRoot" in arg) serverArg.socketRoot = arg.socketRoot;

      this.#server = new IPC_Server(serverArg);
    }

    this.on = this.#server.on;
    this.close = this.#server.close;
    this.listen = this.#server.listen;
    this.broadcast = this.#server.broadcast;
  }

  #rawRequestHandler = (arg: RequestHandler_Argument) => {
    const { connectionId, request: rawRequest } = arg;

    const response = new Response({
      connectionId,
      sendResponse: this.#server.sendResponse,
    });

    const request = normalizeRawRequest({
      rawRequest,
      excludeProperties: ["type"],
    });

    routeRequestToRouteGroup({
      req: request,
      res: response,
      getRouteGroup: this.getRouteGroupStack({ method: request.method }),
    });
  };

  *getRouteGroupStack(arg: {
    method: PrimaryGeneralRequest["method"];
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
        ERROR_HANDLER_FLAG,
        route: this.#appLevelRoute,
        handlers: [firstArg, ...handlers],
      });

      return;
    }

    super.use(firstArg, ...handlers);
  }
}

export function $errorMiddleware(middleware: MiddleWare) {
  middleware[ERROR_HANDLER_FLAG] = true;
  return middleware;
}
