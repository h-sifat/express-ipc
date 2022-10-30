import type {
  RegisteredRouteHandlers,
  RouteHandlerRestParameter,
} from "./interface";
import { assert } from "handy-types";

export class RequestHandlerRegistrar {
  readonly #register: RegisteredRouteHandlers;

  constructor(arg: { register: RegisteredRouteHandlers }) {
    this.#register = arg.register;
  }

  get(path: string, ...handlers: RouteHandlerRestParameter) {
    this.#registrar({ path, group: "get", handlers });
  }

  post(path: string, ...handlers: RouteHandlerRestParameter) {
    this.#registrar({ path, group: "post", handlers });
  }

  patch(path: string, ...handlers: RouteHandlerRestParameter) {
    this.#registrar({ path, group: "patch", handlers });
  }

  delete(path: string, ...handlers: RouteHandlerRestParameter) {
    this.#registrar({ path, group: "delete", handlers });
  }

  all(path: string, ...handlers: RouteHandlerRestParameter) {
    this.#registrar({ path, group: "all", handlers });
  }

  #registrar(arg: {
    path: string;
    group: keyof RegisteredRouteHandlers;
    handlers: RouteHandlerRestParameter;
  }) {
    const { path, group, handlers } = arg;

    registerRouteHandlers<RegisteredRouteHandlers>({
      path,
      group,
      handlers,
      register: this.#register,
    });
  }
}

export function registerRouteHandlers<Register extends object>(arg: {
  path: string;
  register: Register;
  group: keyof Register;
  handlers: (Function | Function[])[];
}) {
  const { path, group, register } = arg;

  assert<string>("non_empty_string", path, {
    name: "path",
    code: "INVALID_PATH",
  });

  const flattenHandlers = arg.handlers.flat();
  assert.cache<RouteHandlerRestParameter>("function[]", flattenHandlers, {
    name: "Request handlers",
    code: "INVALID_REQUEST_HANDLERS",
  });

  if (path in register[group]) register[group][path].push(...flattenHandlers);
  else register[group][path] = flattenHandlers;
}
