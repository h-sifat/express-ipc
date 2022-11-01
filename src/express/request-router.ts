import type {
  RouteObject,
  ErrorHandler,
  RouteHandlerGroup,
  RequestAndResponse,
  GeneralRouteHandler,
  ErrorHandler_Argument,
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

  const routerGroup = getRouteGroup.next().value;
  if (!routerGroup) return await notFoundHandler({ req, res });

  const moveToNextRouteGroup = () => routeRequestToRouteGroup(arg);

  await routeRequestToRoute({
    req,
    res,
    moveToNextRouteGroup,
    getRoute: makeGenerator<RouteObject>(Object.values(routerGroup)),
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
      getErrorHandler: makeGenerator<ErrorHandler>(route.errorHandlers),
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
    getGeneralHandler: makeGenerator<GeneralRouteHandler>(
      route.generalHandlers
    ),
  });
}

export type ExecuteGeneralHandler_Argument = RequestAndResponse & {
  moveToNextRoute(): Promise<void>;
  getGeneralHandler: Generator<GeneralRouteHandler, GeneralRouteHandler>;
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
    await handler({ req, res, next });
  } catch (ex) {
    if (isNextAlreadyCalled) throw ex;
    await moveToErrorHandler({ req, res, error: ex });
  }
}

export async function defaultErrorHandler(
  arg: Omit<ErrorHandler_Argument, "next">
) {
  const error = {
    code: "INTERNAL_SERVER_ERROR",
    message: `Internal server error.`,
  };

  arg.res.send(error, { isError: true });
}

export type ExecuteErrorHandler_Argument = RequestAndResponse & {
  error: any;
  getErrorHandler: Generator<ErrorHandler, ErrorHandler>;
};
export async function executeErrorHandler(arg: ExecuteErrorHandler_Argument) {
  const { req, res, error, getErrorHandler } = arg;

  const errorHandler = getErrorHandler.next().value;
  if (!errorHandler) return await defaultErrorHandler({ req, res, error });

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

  await errorHandler({ req, res, error, next });
}
