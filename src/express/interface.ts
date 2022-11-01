import type { PrimaryGeneralRequest, PlainObject } from "../interface";

export interface ResponseInterface {
  isSent: boolean;
  send(
    dataOrError: object,
    options: { type?: "json"; endConnection?: false; isError?: boolean }
  ): void;
}

export type RequestInterface = PrimaryGeneralRequest & {
  path: string;
  params: PlainObject<unknown>;
};

export interface RequestAndResponse {
  req: RequestInterface;
  res: ResponseInterface;
}

export type RouteHandler_Argument = RequestAndResponse & {
  next(error?: any): void;
};

export type GeneralRouteHandler = (
  arg: RouteHandler_Argument
) => void | Promise<void>;

export type ErrorHandler_Argument = RouteHandler_Argument & { error: any };
export type ErrorHandler = (arg: ErrorHandler_Argument) => void | Promise<void>;

export type RouteHandlerRestParameter = (
  | GeneralRouteHandler
  | ErrorHandler
  | (GeneralRouteHandler | ErrorHandler)[]
)[];

export type RouteMatcher = (arg: string) =>
  | {
      path: string;
      params: { [key: string]: unknown };
    }
  | false;

export type RouteObject = Readonly<{
  path: string;
  matcher: RouteMatcher;
  errorHandlers: GeneralRouteHandler[];
  generalHandlers: GeneralRouteHandler[];
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
