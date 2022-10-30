import type {
  RegisteredRequestHandlers,
  RequestHandlerRestParameter,
} from "./interface";
import { assert } from "handy-types";

export class RequestHandlerRegistrar {
  readonly #register: RegisteredRequestHandlers;

  constructor(arg: { register: RegisteredRequestHandlers }) {
    this.#register = arg.register;
  }

  get(path: string, ...handlers: RequestHandlerRestParameter) {
    this.#registrar({ path, group: "get", handlers });
  }

  post(path: string, ...handlers: RequestHandlerRestParameter) {
    this.#registrar({ path, group: "post", handlers });
  }

  patch(path: string, ...handlers: RequestHandlerRestParameter) {
    this.#registrar({ path, group: "patch", handlers });
  }

  delete(path: string, ...handlers: RequestHandlerRestParameter) {
    this.#registrar({ path, group: "delete", handlers });
  }

  all(path: string, ...handlers: RequestHandlerRestParameter) {
    this.#registrar({ path, group: "all", handlers });
  }

  use(...handlers: RequestHandlerRestParameter) {
    this.#registrar({ path: "/", group: "use", handlers });
  }

  #registrar(arg: {
    path: string;
    handlers: RequestHandlerRestParameter;
    group: keyof RegisteredRequestHandlers;
  }) {
    const { path, group } = arg;

    assert<string>("non_empty_string", path, {
      name: "path",
      code: "INVALID_PATH",
    });

    const flattenHandlers = arg.handlers.flat();
    assert.cache<RequestHandlerRestParameter>("function[]", flattenHandlers, {
      name: "Request handlers",
      code: "INVALID_REQUEST_HANDLERS",
    });

    if (path in this.#register[group])
      this.#register[group][path].push(...flattenHandlers);
    else this.#register[group][path] = flattenHandlers;
  }
}
