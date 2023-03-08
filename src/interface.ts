export interface PlainObject<Type> {
  [key: string | number]: Type;
}

export interface RequestMetaData<
  Category extends "general" | "subscribe" | "unsubscribe"
> {
  id: string;
  category: Category;
}

export interface ResponseMetaData<
  Category extends "general" | "subscribe" | "unsubscribe"
> {
  id: string;
  isError: boolean;
  category: Category;
}

export interface GeneralRequestPayload {
  url: string;
  body: object | null;
  query: PlainObject<any>;
  headers: PlainObject<any>;
  method: "get" | "post" | "delete" | "patch";
}

export interface GeneralResponsePayload<BodyType = any> {
  body: BodyType;
  headers: PlainObject<any>;
}

export interface GeneralRequest {
  payload: GeneralRequestPayload;
  metadata: RequestMetaData<"general">;
}

export interface SubscribeChannelsRequest {
  payload: { channels: string[] };
  metadata: RequestMetaData<"subscribe">;
}

export interface UnsubscribeChannelsRequest {
  payload: { channels: string[] };
  metadata: RequestMetaData<"unsubscribe">;
}

export type SocketRequest =
  | GeneralRequest
  | SubscribeChannelsRequest
  | UnsubscribeChannelsRequest;

export interface BroadcastResponse {
  payload: object;
  metadata: { channel: string; category: "broadcast" };
}

export type GeneralRequestResponse = {
  payload: GeneralResponsePayload;
  metadata: ResponseMetaData<"general" | "subscribe" | "unsubscribe">;
};

export type SocketResponse = BroadcastResponse | GeneralRequestResponse;
