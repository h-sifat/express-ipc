import type { GeneralRequestPayload, PlainObject } from "../interface";

export interface ResponseInterface {
  isSent: boolean;
  send(
    dataOrError: object,
    options?: { type?: "json"; endConnection?: false; isError?: boolean }
  ): void;
}

export type ExpressRequest = GeneralRequestPayload & {
  path: string;
  params: PlainObject<unknown>;
};

export interface RequestAndResponse {
  req: ExpressRequest;
  res: ResponseInterface;
}

export type Middleware_Argument = RequestAndResponse & {
  next(error?: any): void;
};

export type MiddleWare = (
  arg: Middleware_Argument,
  error: any
) => any | Promise<any>;
export type MiddlewareRestParameter = (MiddleWare | MiddleWare[])[];

export type RouteMatcher = (arg: string) =>
  | {
      path: string;
      params: { [key: string]: unknown };
    }
  | false;

export type RouteObject = Readonly<{
  path: string;
  matcher: RouteMatcher;
  errorHandlers: MiddleWare[];
  generalHandlers: MiddleWare[];
}>;

export interface RouteHandlerGroup {
  [route: string]: RouteObject;
}

export type RouteHandlersRegister = Readonly<{
  use: RouteHandlerGroup;
  all: RouteHandlerGroup;
  get: RouteHandlerGroup;
  post: RouteHandlerGroup;
  patch: RouteHandlerGroup;
  delete: RouteHandlerGroup;
}>;
