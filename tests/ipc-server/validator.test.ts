import {
  validateRequestPayload,
  validateRequestMetadata,
} from "../../src/ipc-server/validator";

describe("validateRequestMetadata", () => {
  it.each([
    {
      metadata: null,
      errorCode: "INVALID_REQUEST_METADATA",
      case: "is not a plain object",
    },
    {
      metadata: ["not_plain_object"],
      errorCode: "INVALID_REQUEST_METADATA",
      case: "is not a plain object",
    },
    {
      metadata: {},
      errorCode: "MISSING_PROPERTY",
      case: "is missing any required property",
    },
    {
      metadata: { id: "1" },
      errorCode: "MISSING_PROPERTY",
      case: "is missing any required property",
    },
    {
      metadata: { id: 1 },
      errorCode: "INVALID_PROPERTY",
      case: "id not a non_empty_string string",
    },
    {
      metadata: { id: "" },
      errorCode: "INVALID_PROPERTY",
      case: "id not a non_empty_string string",
    },
    {
      metadata: { id: "342", category: "" },
      errorCode: "INVALID_PROPERTY",
      case: "category not a non_empty_string string",
    },
    {
      metadata: { id: "342", category: "unknown_cat" },
      errorCode: "INVALID_REQUEST_CATEGORY",
      case: "category is not valid",
    },
    {
      metadata: { category: "general" },
      errorCode: "MISSING_PROPERTY",
      case: "is missing any required property",
    },
  ])(
    `throws error ("$errorCode") if metadata $case`,
    ({ metadata, errorCode }) => {
      expect.assertions(1);
      try {
        validateRequestMetadata(metadata);
      } catch (ex) {
        expect(ex.code).toBe(errorCode);
      }
    }
  );

  {
    const id = "1";
    const validMetadata = [
      { id, category: "general" },
      { id, category: "subscribe" },
      { id, category: "unsubscribe" },
    ];

    it(`doesn't throw error if metadata is valid`, () => {
      expect(() => {
        for (const metadata of validMetadata) validateRequestMetadata(metadata);
      }).not.toThrow();
    });
  }
});

describe("validateRequestPayload", () => {
  const subscribePayload = Object.freeze({
    channels: ["tui"],
  });

  const unsubscribePayload = Object.freeze({
    channels: ["tui"],
  });

  const generalRequestPayload = Object.freeze({
    method: "patch",
    url: "/users/34",
    query: { lookup: "self" },
    body: { name: "Alex", age: 98 },
    headers: { "x-auth-token": "afa0ads7f89ad6sf" },
  });

  it.each([
    {
      category: "subscribe",
      errorCode: "INVALID_PROPERTY",
      payload: { ...subscribePayload, channels: null },
      case: `subscribeRequest.channels is not a non empty string array`,
    },
    {
      category: "subscribe",
      errorCode: "INVALID_PROPERTY",
      payload: { ...subscribePayload, channels: ["hi", 1] },
      case: `subscribeRequest.channels is not a non empty string array`,
    },
    {
      category: "unsubscribe",
      errorCode: "INVALID_PROPERTY",
      payload: { ...unsubscribePayload, channels: null },
      case: `unsubscribeRequest.channels is not a non empty string array`,
    },
    {
      category: "unsubscribe",
      errorCode: "INVALID_PROPERTY",
      payload: { ...unsubscribePayload, channels: ["hi", 1] },
      case: `unsubscribeRequest.channels is not a non empty string array`,
    },
    {
      category: "general",
      errorCode: "INVALID_REQUEST_METHOD",
      case: `generalRequest.method is not valid`,
      payload: { ...generalRequestPayload, method: "head" },
    },
    {
      category: "general",
      errorCode: "INVALID_PROPERTY",
      case: `generalRequest.body is not an object`,
      payload: { ...generalRequestPayload, body: "not an object" },
    },
    {
      category: "general",
      errorCode: "INVALID_PROPERTY",
      payload: { ...generalRequestPayload, headers: [{ a: 1 }] },
      case: `generalRequest.headers is not a plain_object`,
    },
    {
      category: "general",
      errorCode: "INVALID_PROPERTY",
      payload: { ...generalRequestPayload, query: [{ a: 1 }] },
      case: `generalRequest.query is not a plain_object`,
    },
    {
      category: "general",
      errorCode: "INVALID_PROPERTY",
      payload: { ...generalRequestPayload, url: "" },
      case: `generalRequest.url is not a non_empty_string`,
    },
  ])(`throw ewc "$errorCode" if $case`, ({ payload, category, errorCode }) => {
    expect.assertions(1);
    try {
      validateRequestPayload(payload, category as any);
    } catch (ex) {
      expect(ex.code).toBe(errorCode);
    }
  });

  it.each([
    {
      payload: generalRequestPayload,
      category: "general",
    },
    {
      payload: subscribePayload,
      category: "subscribe",
    },
    {
      payload: unsubscribePayload,
      category: "unsubscribe",
    },
  ])("doesn't throw error for valid payloads", ({ payload, category }) => {
    expect(() => {
      validateRequestPayload(payload, category as any);
    }).not.toThrow();
  });
});
