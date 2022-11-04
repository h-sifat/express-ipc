import type {
  SocketRequest,
  GeneralRequestPayload,
  SubscribeChannelsRequest,
  UnsubscribeChannelsRequest,
} from "../interface";
import { assert } from "handy-types";
import { EPP, validate } from "../util";
import type { ValidatorSchema } from "../util";
import { VALID_REQUEST_METHODS, VALID_REQUEST_CATEGORIES } from "./ipc-server";
import { Listen_Argument } from "./interface";

const requestMetaDataSchema: Readonly<
  ValidatorSchema<SocketRequest["metadata"]>
> = Object.freeze({
  id: "non_empty_string",
  category: "non_empty_string",
});

const subscribeAndUnsubscribeRequestPayloadSchema: Readonly<
  ValidatorSchema<SubscribeChannelsRequest["payload"]>
> = Object.freeze({
  channels: { type: "non_empty_string[]", required: true, cache: true },
});

const generalRequestPayloadSchema: Readonly<
  ValidatorSchema<GeneralRequestPayload>
> = Object.freeze({
  body: "object",
  query: "plain_object",
  headers: "plain_object",
  url: "non_empty_string",
  method: "non_empty_string",
});

export function validateRequestMetadata(
  metadata: unknown
): asserts metadata is SocketRequest["metadata"] {
  assert<object>("plain_object", metadata, {
    name: "Request metadata",
    code: "INVALID_REQUEST_METADATA",
  });

  validate<SocketRequest["metadata"]>(metadata, {
    name: "Request metadata",
    schema: requestMetaDataSchema,
  });

  if (!VALID_REQUEST_CATEGORIES.includes(metadata.category))
    throw new EPP({
      code: "INVALID_REQUEST_CATEGORY",
      message: `Invalid request category: "${metadata.category}"`,
    });
}

export function validateRequestPayload(
  payload: unknown,
  category: SocketRequest["metadata"]["category"]
): asserts payload is SocketRequest["payload"] {
  switch (category) {
    case "subscribe":
    case "unsubscribe":
      validate<
        | SubscribeChannelsRequest["payload"]
        | UnsubscribeChannelsRequest["payload"]
      >(payload, {
        name: "Request payload",
        schema: subscribeAndUnsubscribeRequestPayloadSchema,
      });
      return;

    case "general":
      validate<GeneralRequestPayload>(payload, {
        name: "Request payload",
        schema: generalRequestPayloadSchema,
      });

      if (!VALID_REQUEST_METHODS.includes(payload.method))
        throw new EPP({
          code: "INVALID_REQUEST_METHOD",
          message: `Invalid request method: ${payload.method}`,
        });
  }
}

export function validateDelimiter(delimiter: any) {
  assert<string>("non_empty_string", delimiter, {
    name: "delimiter",
    code: "INVALID_DELIMITER",
  });

  if (delimiter.length !== 1)
    throw new EPP({
      code: "INVALID_DELIMITER:NOT_CHAR",
      message: `The "delimiter" must be a single character.`,
    });
}

export function validateSocketPath(
  path: unknown
): asserts path is Listen_Argument["path"] {
  assert.cache("non_empty_string | plain_object", path, {
    name: "path",
    code: "INVALID_PATH",
  });
}
