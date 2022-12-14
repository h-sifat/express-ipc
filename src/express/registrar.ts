import type {
  RouteObject,
  RouteMatcher,
  RouteHandlersRegister,
  MiddlewareRestParameter,
} from "./interface";

import { EPP } from "../util";
import { assert } from "handy-types";
import { match } from "path-to-regexp";

type IsErrorMiddleware = (middleware: Function) => boolean;

export interface RouteHandlersRegistrarConstructor_Argument {
  register: RouteHandlersRegister;
  isErrorMiddleware: IsErrorMiddleware;
}

export class RouteHandlerRegistrar {
  readonly #register: RouteHandlersRegister;
  readonly #isErrorMiddleware: IsErrorMiddleware;

  constructor(arg: RouteHandlersRegistrarConstructor_Argument) {
    this.#register = arg.register;
    this.#isErrorMiddleware = arg.isErrorMiddleware;
  }

  get(path: string, ...handlers: MiddlewareRestParameter) {
    this.#registrar({ path, group: "get", handlers });
  }

  post(path: string, ...handlers: MiddlewareRestParameter) {
    this.#registrar({ path, group: "post", handlers });
  }

  patch(path: string, ...handlers: MiddlewareRestParameter) {
    this.#registrar({ path, group: "patch", handlers });
  }

  delete(path: string, ...handlers: MiddlewareRestParameter) {
    this.#registrar({ path, group: "delete", handlers });
  }

  all(path: string, ...handlers: MiddlewareRestParameter) {
    this.#registrar({ path, group: "all", handlers });
  }
  use(path: string, ...handlers: MiddlewareRestParameter) {
    this.#registrar({ path, group: "use", handlers });
  }

  #registrar(arg: {
    path: string;
    group: keyof RouteHandlersRegister;
    handlers: MiddlewareRestParameter;
  }) {
    const { path, group, handlers } = arg;

    assert<string>("non_empty_string", path, {
      name: "path",
      code: "INVALID_PATH",
    });

    if (!(group in this.#register))
      throw new EPP({
        code: "UNKNOWN_GROUP",
        message: `Attempts to register route handlers in unknown group named: "${String(
          group
        )}"`,
      });

    if (!(path in this.#register[group]))
      this.#register[group][path] = Object.freeze({
        path,
        errorHandlers: [],
        generalHandlers: [],
        matcher: match(path) as RouteMatcher,
      });

    registerRouteHandlers({
      handlers,
      route: this.#register[group][path],
      isErrorMiddleware: this.#isErrorMiddleware,
    });
  }
}

export function registerRouteHandlers(arg: {
  route: RouteObject;
  handlers: MiddlewareRestParameter;
  isErrorMiddleware: IsErrorMiddleware;
}) {
  const flattenHandlers = arg.handlers.flat();
  assert.cache<MiddlewareRestParameter>("function[]", flattenHandlers, {
    name: "Request handlers",
    code: "INVALID_ROUTE_HANDLERS",
  });

  const { route } = arg;

  for (const handler of flattenHandlers)
    if (arg.isErrorMiddleware(handler)) route.errorHandlers.push(handler);
    else route.generalHandlers.push(handler);
}
