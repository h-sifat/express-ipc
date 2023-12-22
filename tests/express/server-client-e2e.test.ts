import {
  ExpressIPCClient,
  REQUEST_TIMEOUT_ERROR,
} from "../../src/express/client";
import { randomUUID } from "crypto";
import { ExpressIPCServer } from "../../src/express/server";

const namespace = "express-ipc-test";
const id = randomUUID();

function getSampleResponse(method: string) {
  return {
    data: { method },
    res_header: { name: "test", value: "it works!" },
  };
}

const server = new ExpressIPCServer();

// -------------- Server routes config --------------
const ALL_METHODS = ["get", "post", "patch", "delete"] as const;
const TEST_DATA_ROUTE = "/";
const NO_RESPONSE_ROUTE = "/i_am_dead";

for (const method of ALL_METHODS)
  server[method](TEST_DATA_ROUTE, ({ res }) => {
    res.send(getSampleResponse(method));
  });

// will never send a response back
server.use(NO_RESPONSE_ROUTE, () => {});
// -------------- End Server routes config --------------

server.listen({ path: { namespace, id } });
const client = new ExpressIPCClient({ path: { namespace, id } });

afterAll(() => {
  server.close();
  client.close();
});

describe("Request and Response", () => {
  for (const { method, args } of [
    { method: "get", args: [TEST_DATA_ROUTE] },
    { method: "post", args: [TEST_DATA_ROUTE, {}] },
    { method: "delete", args: [TEST_DATA_ROUTE] },
    { method: "patch", args: [TEST_DATA_ROUTE, {}] },
    { method: "request", args: [{ url: TEST_DATA_ROUTE, method: "get" }] },
  ])
    it(`sends request with the "${method}" and receives a response`, async () => {
      const response = await client[method](...args);

      expect(response).toMatchObject({
        // @ts-ignore
        body: getSampleResponse(method === "request" ? args[0].method : method),
      });
    });
});

describe("Request Time", () => {
  for (const { method, args } of [
    {
      method: "request",
      args: [{ url: NO_RESPONSE_ROUTE, method: "get" }, { timeout: 100 }],
    },
    { method: "get", args: [NO_RESPONSE_ROUTE, { timeout: 100 }] },
    { method: "post", args: [NO_RESPONSE_ROUTE, { timeout: 100 }] },
    { method: "patch", args: [NO_RESPONSE_ROUTE, { timeout: 100 }] },
    { method: "delete", args: [NO_RESPONSE_ROUTE, { timeout: 100 }] },
  ])
    test(`[${method}] request with timeout times out if the server doesn't respond `, async () => {
      try {
        await client[method](...args);
      } catch (ex) {
        expect(ex).toMatchObject({
          code: REQUEST_TIMEOUT_ERROR.code,
          message: REQUEST_TIMEOUT_ERROR.message,
        });
      }
    });
});
