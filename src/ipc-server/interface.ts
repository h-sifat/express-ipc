import type { GeneralRequest, SocketResponse } from "../interface";

export type Listen_Argument = {
  callback?: () => void;
  deleteSocketBeforeListening?: boolean;
  path: string | { namespace: string; id: string };
};

export interface ConnectionId {
  connectionId: number;
}

export type SendResponse_Argument = {
  endConnection?: boolean;
} & ConnectionId & { response: SocketResponse };

export type RequestHandler_Argument = ConnectionId & {
  request: GeneralRequest;
};
export interface IPC_ServerConstructor_Argument {
  delimiter: string;
  socketRoot: string;
  requestHandler(arg: RequestHandler_Argument): void;
}

export interface Broadcast_Argument {
  data: object;
  channel: string;
  blacklist?: number[];
}

export interface IPC_ServerInterface {
  listen(arg: Listen_Argument): void;
  sendResponse(arg: SendResponse_Argument): Promise<void>;
  close(callback?: (err?: Error | null) => void): void;
  broadcast(arg: Broadcast_Argument): Promise<void>;
  createChannels(...channels: (string | string[])[]): void;
  deleteChannels(...channels: (string | string[])[]): void;
  on(event: string, listener: (...args: any[]) => void): void;

  get socketPath(): string | undefined;
}

export interface IPC_ServerClass {
  new (arg: IPC_ServerConstructor_Argument): IPC_ServerInterface;
}
