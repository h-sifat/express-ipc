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
  query: PlainObject<any>;
  headers: PlainObject<any>;
  body: PlainObject<any> | null;
  method: "get" | "post" | "delete" | "patch";
}

export interface GeneralResponsePayload {
  headers: PlainObject<unknown>;
  body: null | PlainObject<unknown>;
}

export interface GeneralRequest {
  payload: GeneralRequestPayload;
  metadata: RequestMetaData<"general">;
}

export interface GeneralResponse {
  payload: GeneralResponsePayload;
  metadata: ResponseMetaData<"general">;
}

export interface SubscribeChannelsRequest {
  payload: { channels: string[] };
  metadata: RequestMetaData<"subscribe">;
}

export interface SubscribeChannelsResponse {
  payload: {};
  metadata: ResponseMetaData<"subscribe">;
}

export interface UnsubscribeChannelsRequest {
  payload: { channels: string[] };
  metadata: RequestMetaData<"unsubscribe">;
}

export interface UnsubscribeChannelsResponse {
  payload: {};
  metadata: ResponseMetaData<"unsubscribe">;
}

export type SocketRequest =
  | GeneralRequest
  | SubscribeChannelsRequest
  | UnsubscribeChannelsRequest;

export interface BroadcastResponse {
  payload: object;
  metadata: { channel: string; category: "broadcast" };
}

export type RequestResponse = {
  payload: PlainObject<any>;
  metadata: ResponseMetaData<any>;
};
