import { RouteHandlerRegistrar } from "../../src/express/registrar";

const registrarMethods = Object.freeze([
  "use",
  "all",
  "get",
  "post",
  "patch",
  "delete",
]);

const ERROR_HANDLER_FLAG = Symbol();

describe("Validation", () => {
  {
    const register = {
      all: {},
      get: {},
      use: {},
      post: {},
      patch: {},
      delete: {},
    };

    const registrar = new RouteHandlerRegistrar({
      register,
      ERROR_HANDLER_FLAG,
    });

    const invalidPaths = ["", [{}], null, 0, {}];

    const errorCode = "INVALID_PATH";
    it.each(registrarMethods)(
      `throws ewc "${errorCode}" if invalid path is passed to the %p method`,
      (method) => {
        expect.assertions(1);

        const randomInvalidPath =
          invalidPaths[Math.floor(Math.random() * invalidPaths.length)];

        try {
          registrar[method](randomInvalidPath, () => {});
        } catch (ex) {
          expect(ex.code).toBe(errorCode);
        }
      }
    );
  }

  {
    const register = {
      all: {},
      get: {},
      use: {},
      post: {},
      patch: {},
      delete: {},
    };

    const registrar = new RouteHandlerRegistrar({
      register,
      ERROR_HANDLER_FLAG,
    });

    const invalidHandlers = ["", [{}], null, 0, {}, [() => {}, [() => {}]]];

    const errorCode = "INVALID_ROUTE_HANDLERS";
    it.each(registrarMethods)(
      `throws ewc "${errorCode}" if invalid request handler(s) is passed to the %p method`,
      (method) => {
        expect.assertions(1);

        const randomInvalidHandlers =
          invalidHandlers[Math.floor(Math.random() * invalidHandlers.length)];

        try {
          registrar[method]("/categories", randomInvalidHandlers);
        } catch (ex) {
          expect(ex.code).toBe(errorCode);
        }
      }
    );
  }
});

describe("Functionality", () => {
  test.each(registrarMethods)(
    `the %p method registers all the general and error handlers to the given path`,
    (method) => {
      const path = "/categories";

      const generalHandlers = Object.freeze([
        () => {},
        () => {},
        [() => {}],
        () => {},
      ]);
      const flattenedHandlers = generalHandlers.flat();

      const errorHandlers = Object.freeze([[() => {}], () => {}, () => {}]);
      const flattenedErrorHandlers = errorHandlers.flat();

      // marking this handlers as error handlers
      flattenedErrorHandlers.forEach((handler) => {
        handler[ERROR_HANDLER_FLAG] = true;
      });

      const register = {
        all: {},
        get: {},
        use: {},
        post: {},
        patch: {},
        delete: {},
      };

      const registrar = new RouteHandlerRegistrar({
        register,
        ERROR_HANDLER_FLAG,
      });
      registrar[method](path, ...generalHandlers, ...errorHandlers);

      expect(register[method][path]).toEqual({
        path,
        matcher: expect.any(Function),
        generalHandlers: flattenedHandlers,
        errorHandlers: flattenedErrorHandlers,
      });
    }
  );
});
