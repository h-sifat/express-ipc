import type {
  MiddleWare,
  RouteObject,
  RouteHandlerGroup,
  RequestAndResponse,
  Middleware_Argument,
} from "./interface";
import { EPP, makeGenerator } from "../util";

export async function notFoundHandler(arg: RequestAndResponse) {
  const error = {
    code: "NOT_FOUND",
    message: `No request handler found for the url: "${arg.req.url}"`,
  };
  arg.res.send(error, { isError: true });
}

export type RouteRequestToRouterGroup_Argument = RequestAndResponse & {
  getRouteGroup: Generator<RouteHandlerGroup, RouteHandlerGroup>;
};
export async function routeRequestToRouteGroup(
  arg: RouteRequestToRouterGroup_Argument
) {
  const { req, res, getRouteGroup } = arg;

  const routeGroup = getRouteGroup.next().value;
  if (!routeGroup) return await notFoundHandler({ req, res });

  const moveToNextRouteGroup = () => routeRequestToRouteGroup(arg);

  await routeRequestToRoute({
    req,
    res,
    moveToNextRouteGroup,
    getRoute: makeGenerator<RouteObject>(Object.values(routeGroup)),
  });
}

export type RouteRequestToRoute_Argument = RequestAndResponse & {
  getRoute: Generator<RouteObject, RouteObject>;
  moveToNextRouteGroup(): Promise<void>;
};
export async function routeRequestToRoute(arg: RouteRequestToRoute_Argument) {
  const {
    req,
    res,
    getRoute,
    moveToNextRouteGroup: moveToNextRouterGroup,
  } = arg;

  const route = getRoute.next().value;
  if (!route) return await moveToNextRouterGroup();

  const moveToNextRoute = () => routeRequestToRoute(arg);
  const moveToErrorHandler = (arg: RequestAndResponse & { error: any }) =>
    executeErrorHandler({
      ...arg,
      getErrorHandler: makeGenerator<MiddleWare>(route.errorHandlers),
    });

  const matchResult = route.matcher(req.url);
  if (!matchResult) return moveToNextRoute();

  req.path = matchResult.path;
  req.params = matchResult.params;

  await executeGeneralHandler({
    req,
    res,
    moveToNextRoute,
    moveToErrorHandler,
    getGeneralHandler: makeGenerator<MiddleWare>(route.generalHandlers),
  });
}

export type ExecuteGeneralHandler_Argument = RequestAndResponse & {
  moveToNextRoute(): Promise<void>;
  getGeneralHandler: Generator<MiddleWare, MiddleWare>;
  moveToErrorHandler(arg: RequestAndResponse & { error: any }): Promise<void>;
};

export async function executeGeneralHandler(
  arg: ExecuteGeneralHandler_Argument
) {
  const { req, res, getGeneralHandler, moveToNextRoute, moveToErrorHandler } =
    arg;

  const handler = getGeneralHandler.next().value;
  if (!handler) return await moveToNextRoute();

  let isNextAlreadyCalled = false;
  async function next(error?: any) {
    if (isNextAlreadyCalled)
      throw new EPP({
        code: "NEXT_ALREADY_CALLED",
        message: `"next" cannot be called twice from a handler.`,
      });

    isNextAlreadyCalled = true;

    if (error) await moveToErrorHandler({ req, res, error });
    else await executeGeneralHandler(arg); // move to next handler
  }

  try {
    // @ts-expect-error intentionally not passing "error" property
    await handler({ req, res, next });
  } catch (ex) {
    if (isNextAlreadyCalled) throw ex;
    await moveToErrorHandler({ req, res, error: ex });
  }
}

export async function defaultErrorHandler(
  reqAndRes: Omit<Middleware_Argument, "next">,
  _error: any
) {
  const DEFAULT_ERROR = {
    code: "INTERNAL_SERVER_ERROR",
    message: `Internal server error.`,
  };

  reqAndRes.res.send(DEFAULT_ERROR, { isError: true });
}

export type ExecuteErrorHandler_Argument = RequestAndResponse & {
  error: any;
  getErrorHandler: Generator<MiddleWare, MiddleWare>;
};
export async function executeErrorHandler(arg: ExecuteErrorHandler_Argument) {
  const { req, res, error, getErrorHandler } = arg;

  const errorHandler = getErrorHandler.next().value;
  if (!errorHandler) return await defaultErrorHandler({ req, res }, error);

  let isNextAlreadyCalled = false;
  async function next(modifiedError = error) {
    if (isNextAlreadyCalled)
      throw new EPP({
        code: "NEXT_ALREADY_CALLED",
        message: `"next" cannot be called twice from a handler.`,
      });
    isNextAlreadyCalled = true;

    await executeErrorHandler({ ...arg, error: modifiedError });
  }

  await errorHandler({ req, res, next }, error);
}
