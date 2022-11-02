export interface PlainObject<Type> {
  [key: string | number]: Type;
}

export interface SubscribeChannelsRequest {
  type: "subscribe";
  channels: string[];
}

export interface UnsubscribeChannelsRequest {
  channels: string[];
  type: "unsubscribe";
}

export type PrimaryGeneralRequest = {
  url: string;
  type: "general";
  query: PlainObject<any>;
  headers: PlainObject<any>;
  body: PlainObject<any> | null;
  method: "get" | "post" | "delete" | "patch";
};

export type SocketRequest =
  | SubscribeChannelsRequest
  | UnsubscribeChannelsRequest
  | PrimaryGeneralRequest;

export type Request = PrimaryGeneralRequest & { params: PlainObject<any> };

export interface SocketResponse {
  headers: Headers;
  body: PlainObject<any> | Array<any>;
}
