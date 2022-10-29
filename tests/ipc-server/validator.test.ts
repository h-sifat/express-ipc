import { validateRequest } from "../../src/ipc-server/validator";

describe("validateRequest", () => {
  const subscribeRequest = Object.freeze({
    type: "subscribe",
    channels: ["tui"],
  });

  const unsubscribeRequest = Object.freeze({
    type: "unsubscribe",
    channels: ["tui"],
  });

  const generalRequest = Object.freeze({
    method: "patch",
    type: "general",
    url: "/users/34",
    query: { lookup: "self" },
    body: { name: "Alex", age: 98 },
    headers: { "x-auth-token": "afa0ads7f89ad6sf" },
  });

  it.each([
    {
      case: `request "type" is not valid`,
      request: { ...subscribeRequest, type: "duck" },
      errorCode: "INVALID_REQUEST_TYPE",
    },
    {
      errorCode: "INVALID_REQUEST_TYPE",
      case: `request "type" is not valid`,
      request: { ...generalRequest, type: "not-a-valid-type" },
    },
    {
      errorCode: "INVALID_PROPERTY",
      request: { ...subscribeRequest, channels: null },
      case: `subscribeRequest.channels is not a non empty string array`,
    },
    {
      errorCode: "INVALID_PROPERTY",
      request: { ...subscribeRequest, channels: ["hi", 1] },
      case: `subscribeRequest.channels is not a non empty string array`,
    },
    {
      errorCode: "INVALID_PROPERTY",
      request: { ...unsubscribeRequest, channels: null },
      case: `unsubscribeRequest.channels is not a non empty string array`,
    },
    {
      errorCode: "INVALID_PROPERTY",
      request: { ...unsubscribeRequest, channels: ["hi", 1] },
      case: `unsubscribeRequest.channels is not a non empty string array`,
    },
    {
      errorCode: "INVALID_REQUEST_METHOD",
      request: { ...generalRequest, method: "head" },
      case: `generalRequest.method is not valid`,
    },
    {
      errorCode: "INVALID_PROPERTY",
      request: { ...generalRequest, body: null },
      case: `generalRequest.body is not a non_null_object`,
    },
    {
      errorCode: "INVALID_PROPERTY",
      request: { ...generalRequest, headers: [{ a: 1 }] },
      case: `generalRequest.headers is not a plain_object`,
    },
    {
      errorCode: "INVALID_PROPERTY",
      request: { ...generalRequest, query: [{ a: 1 }] },
      case: `generalRequest.query is not a plain_object`,
    },
    {
      errorCode: "INVALID_PROPERTY",
      request: { ...generalRequest, url: "" },
      case: `generalRequest.url is not a non_empty_string`,
    },
  ])(`throw ewc "$errorCode" if $case`, ({ request, errorCode }) => {
    expect.assertions(1);
    try {
      validateRequest(request);
    } catch (ex) {
      expect(ex.code).toBe(errorCode);
    }
  });

  it.each([generalRequest, subscribeRequest, unsubscribeRequest])(
    "doesn't throw error for valid requests",
    (request) => {
      expect(() => {
        validateRequest(request);
      }).not.toThrow();
    }
  );
});
