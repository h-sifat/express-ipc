import type {
  SocketRequest,
  PrimaryGeneralRequest,
  SubscribeChannelsRequest,
  UnsubscribeChannelsRequest,
} from "../interface";
import { EPP, validate } from "../util";
import type { ValidatorSchema } from "../util";
import { VALID_REQUEST_METHODS, VALID_REQUEST_TYPES } from "./ipc-server";

const subscribeAndUnsubscribeRequestSchema: Readonly<
  ValidatorSchema<SubscribeChannelsRequest>
> = Object.freeze({
  type: "non_empty_string",
  channels: {
    cache: true,
    required: true,
    type: "non_empty_string[]",
  },
});

const primaryGeneralRequestSchema: Readonly<
  ValidatorSchema<PrimaryGeneralRequest>
> = Object.freeze({
  body: "non_null_object",
  query: "plain_object",
  headers: "plain_object",
  url: "non_empty_string",
  type: "non_empty_string",
  method: "non_empty_string",
});

export function validateRequest(
  request: any
): asserts request is SocketRequest {
  if (!VALID_REQUEST_TYPES.includes(request?.type))
    throw new EPP({
      code: "INVALID_REQUEST_TYPE",
      message: `Invalid request type: "${request.type}"`,
    });

  switch (request.type as SocketRequest["type"]) {
    case "subscribe":
    case "unsubscribe":
      validate<SubscribeChannelsRequest | UnsubscribeChannelsRequest>(request, {
        name: "Request",
        schema: subscribeAndUnsubscribeRequestSchema,
      });
      return;

    case "general":
      validate<PrimaryGeneralRequest>(request, {
        name: "Request",
        schema: primaryGeneralRequestSchema,
      });

      if (!VALID_REQUEST_METHODS.includes(request.method))
        throw new EPP({
          code: "INVALID_REQUEST_METHOD",
          message: `Invalid request method: ${request.method}`,
        });
  }
}
