export type RouteHandler = (arg: {}) => void;
export type RouteHandlerRestParameter = (RouteHandler | RouteHandler[])[];

export interface RouteHandlerGroup {
  [path: string]: RouteHandler[];
}

export type RegisteredRouteHandlers = Readonly<{
  all: RouteHandlerGroup;
  get: RouteHandlerGroup;
  post: RouteHandlerGroup;
  patch: RouteHandlerGroup;
  delete: RouteHandlerGroup;
}>;
