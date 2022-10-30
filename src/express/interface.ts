export type RequestHandler = (arg: {}) => void;
export type RequestHandlerRestParameter = (RequestHandler | RequestHandler[])[];

export interface RequestHandlersOfPaths {
  [path: string]: RequestHandler[];
}

export interface RegisteredRequestHandlers {
  all: RequestHandlersOfPaths;
  get: RequestHandlersOfPaths;
  use: RequestHandlersOfPaths;
  post: RequestHandlersOfPaths;
  patch: RequestHandlersOfPaths;
  delete: RequestHandlersOfPaths;
}
