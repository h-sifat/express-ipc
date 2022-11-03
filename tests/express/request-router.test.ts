import { match } from "path-to-regexp";
import { makeGenerator } from "../../src/util";
import { routeRequestToRouteGroup } from "../../src/express/request-router";

describe("routeRequestToRouteGroup", () => {
  {
    const errorCode = "NOT_FOUND";
    it(`sends error response with code "${errorCode}" if no more routeGroup is left and the request is not complete`, async () => {
      const getRouteGroup = makeGenerator([]);
      const req = { url: "/users" };
      const res = { send: jest.fn() };

      // @ts-expect-error
      await routeRequestToRouteGroup({ req, res, getRouteGroup });

      expect(res.send).toHaveBeenCalledTimes(1);
      expect(res.send).toHaveBeenCalledWith(
        { message: expect.any(String), code: errorCode },
        { isError: true }
      );
    });
  }

  it(`calls the first general handler of a matching route and doesn't proceed further if next is not called`, async () => {
    const firstHandler = jest.fn();
    const secondHandler = jest.fn();

    const path = "/users/:id";

    const getRouteGroup = makeGenerator([
      {
        [path]: {
          path,
          errorHandlers: [],
          matcher: match(path),
          generalHandlers: Object.freeze([firstHandler, secondHandler]),
        },
      },
    ]);

    const userId = "12";
    const req = { url: `/users/${userId}` };
    const res = { send: jest.fn() };

    // @ts-expect-error
    await routeRequestToRouteGroup({ req, res, getRouteGroup });

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenCalledWith({
      req,
      res,
      next: expect.any(Function),
    });

    const reqArgumentOfFirstHandler = firstHandler.mock.calls[0][0].req;
    expect(reqArgumentOfFirstHandler).toEqual({
      url: req.url,
      path: req.url,
      params: { id: userId },
    });

    expect(secondHandler).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it(`routes request to the next handler if next is called`, async () => {
    const firstHandler = jest.fn(({ next }) => {
      next();
    });
    const secondHandler = jest.fn();

    const path = "/users";

    const getRouteGroup = makeGenerator([
      {
        [path]: {
          path,
          errorHandlers: [],
          matcher: match(path),
          generalHandlers: Object.freeze([firstHandler, secondHandler]),
        },
      },
    ]);

    const req = { url: path };
    const res = { send: jest.fn() };

    // @ts-expect-error
    await routeRequestToRouteGroup({ req, res, getRouteGroup });

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenCalledWith({
      req,
      res,
      next: expect.any(Function),
    });

    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledWith({
      req,
      res,
      next: expect.any(Function),
    });
  });

  it(`routes request to the next handler of the next routeGroup if next is called and no more handler exists in the current group`, async () => {
    const firstHandler = jest.fn(({ next }) => next());
    const secondHandler = jest.fn(({ next }) => next());
    const thirdHandler = jest.fn(({ next }) => next());

    const path = "/users";

    const getRouteGroup = makeGenerator([
      {
        [path]: {
          path,
          errorHandlers: [],
          matcher: match(path),
          generalHandlers: Object.freeze([firstHandler, secondHandler]),
        },
      },
      {
        [path]: {
          path,
          errorHandlers: [],
          matcher: match(path),
          generalHandlers: Object.freeze([thirdHandler]),
        },
      },
    ]);

    const req = { url: path };
    const res = { send: jest.fn() };

    // @ts-expect-error
    await routeRequestToRouteGroup({ req, res, getRouteGroup });

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenCalledWith({
      req,
      res,
      next: expect.any(Function),
    });

    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledWith({
      req,
      res,
      next: expect.any(Function),
    });

    expect(thirdHandler).toHaveBeenCalledTimes(1);
    expect(thirdHandler).toHaveBeenCalledWith({
      req,
      res,
      next: expect.any(Function),
    });
  });

  it(`routes request to the default notFoundHandler if next is called an no more handlers or new group exists`, async () => {
    const firstHandler = jest.fn(({ next }) => {
      next();
    });

    const path = "/users";

    const getRouteGroup = makeGenerator([
      {
        [path]: {
          path,
          errorHandlers: [],
          matcher: match(path),
          generalHandlers: Object.freeze([firstHandler]),
        },
      },
    ]);

    const req = { url: path };
    const res = { send: jest.fn() };

    // @ts-expect-error
    await routeRequestToRouteGroup({ req, res, getRouteGroup });

    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledTimes(1);
    expect(res.send).toHaveBeenCalledWith(
      { code: "NOT_FOUND", message: expect.any(String) },
      { isError: true }
    );
  });
});

describe("Error Handling", () => {
  const ERROR = new Error("oops");

  it.each([
    {
      firstHandler: jest.fn(() => {
        throw ERROR;
      }),
      case: "a middleware function throws an error",
    },
    {
      firstHandler: jest.fn().mockRejectedValueOnce(ERROR),
      case: "a middleware function rejects a promise",
    },
    {
      firstHandler: jest.fn(({ next }) => {
        next(ERROR);
      }),
      case: `a middleware calls the "next" function with an error`,
    },
  ])(
    `routes request to the default errorHandler if $case and no custom error middleware exists`,
    async ({ firstHandler }) => {
      const path = "/users";

      const getRouteGroup = makeGenerator([
        {
          [path]: {
            path,
            errorHandlers: [],
            matcher: match(path),
            generalHandlers: Object.freeze([firstHandler]),
          },
        },
      ]);

      const req = { url: path };
      const res = { send: jest.fn() };

      // @ts-expect-error
      await routeRequestToRouteGroup({ req, res, getRouteGroup });

      expect(firstHandler).toHaveBeenCalledTimes(1);
      expect(res.send).toHaveBeenCalledTimes(1);
      expect(res.send).toHaveBeenCalledWith(
        { code: "INTERNAL_SERVER_ERROR", message: expect.any(String) },
        { isError: true }
      );
    }
  );

  it.each([
    {
      generalHandler: jest.fn(() => {
        throw ERROR;
      }),
      case: "a middleware function throws an error",
    },
    {
      generalHandler: jest.fn().mockRejectedValueOnce(ERROR),
      case: "a middleware function rejects a promise",
    },
    {
      generalHandler: jest.fn(({ next }) => {
        next(ERROR);
      }),
      case: `a middleware calls the "next" function with an error`,
    },
  ])(
    `routes request to the custom errorHandler if $case`,
    async ({ generalHandler }) => {
      const errorHandler = jest.fn();

      const path = "/users";

      const getRouteGroup = makeGenerator([
        {
          [path]: {
            path,
            matcher: match(path),
            errorHandlers: [errorHandler],
            generalHandlers: Object.freeze([generalHandler]),
          },
        },
      ]);

      const req = { url: path };
      const res = { send: jest.fn() };

      // @ts-expect-error
      await routeRequestToRouteGroup({ req, res, getRouteGroup });

      expect(generalHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenCalledWith(
        { req, res, next: expect.any(Function) },
        ERROR
      );
    }
  );

  it(`routes request to the next custom error middleware if next is called`, async () => {
    const generalHandler = jest.fn().mockRejectedValueOnce(ERROR);

    const MODIFIED_ERROR = new Error("modified");
    const firstErrorHandler = jest.fn(({ next }) => {
      next(MODIFIED_ERROR); // we can modify the error object
    });
    const secondErrorHandler = jest.fn();

    const path = "/users";

    const getRouteGroup = makeGenerator([
      {
        [path]: {
          path,
          matcher: match(path),
          errorHandlers: [firstErrorHandler, secondErrorHandler],
          generalHandlers: [generalHandler],
        },
      },
    ]);

    const req = { url: path };
    const res = { send: jest.fn() };

    // @ts-expect-error
    await routeRequestToRouteGroup({ req, res, getRouteGroup });

    expect(generalHandler).toHaveBeenCalledTimes(1);
    expect(firstErrorHandler).toHaveBeenCalledTimes(1);
    expect(firstErrorHandler).toHaveBeenCalledWith(
      { req, res, next: expect.any(Function) },
      ERROR
    );

    expect(secondErrorHandler).toHaveBeenCalledTimes(1);
    expect(secondErrorHandler).toHaveBeenCalledWith(
      { req, res, next: expect.any(Function) },
      MODIFIED_ERROR
    );
  });

  it(`routes request to the defaultErrorHandler if a custom error middleware calls next and no more custom errMiddleware exists`, async () => {
    const generalHandler = jest.fn().mockRejectedValueOnce(ERROR);
    const errorHandler = jest.fn(({ next }) => next());
    const path = "/users";
    const getRouteGroup = makeGenerator([
      {
        [path]: {
          path,
          matcher: match(path),
          errorHandlers: [errorHandler],
          generalHandlers: [generalHandler],
        },
      },
    ]);
    const req = { url: path };
    const res = { send: jest.fn() };

    // @ts-expect-error
    await routeRequestToRouteGroup({ req, res, getRouteGroup });

    expect(generalHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler).toHaveBeenCalledTimes(1);

    expect(res.send).toHaveBeenCalledTimes(1);

    expect(res.send).toHaveBeenCalledWith(
      { code: "INTERNAL_SERVER_ERROR", message: expect.any(String) },
      { isError: true }
    );
  });
});
