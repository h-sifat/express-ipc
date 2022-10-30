import { RequestHandlerRegistrar } from "../../src/express/registrar";

const registrarMethods = Object.freeze([
  "all",
  "get",
  "post",
  "patch",
  "delete",
]); // the "use" method is omitted because it doesn't take any path argument

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

    const registrar = new RequestHandlerRegistrar({ register });

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

    const registrar = new RequestHandlerRegistrar({ register });

    const invalidHandlers = ["", [{}], null, 0, {}, [() => {}, [() => {}]]];

    const errorCode = "INVALID_REQUEST_HANDLERS";
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
  {
    const path = "/categories";
    const handlers = Object.freeze([() => {}, () => {}, [() => {}], () => {}]);
    const flattenHandlers = handlers.flat();

    test.each(registrarMethods)(
      `the %p method registers all the handlers to the given path`,
      (method) => {
        const register = {
          all: {},
          get: {},
          use: {},
          post: {},
          patch: {},
          delete: {},
        };

        const registrar = new RequestHandlerRegistrar({ register });
        registrar[method](path, ...handlers);

        expect(register[method][path]).toEqual(flattenHandlers);
      }
    );

    test(`the "use" method registers all the handlers to the root ("/") path`, () => {
      const register = {
        all: {},
        get: {},
        use: {},
        post: {},
        patch: {},
        delete: {},
      };

      const registrar = new RequestHandlerRegistrar({ register });
      registrar.use(...handlers);

      expect(register.use["/"]).toEqual(flattenHandlers);
    });
  }
});
