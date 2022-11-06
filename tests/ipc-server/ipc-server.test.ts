import { tmpdir } from "os";
import path from "path";
import { IPC_Server } from "../../src/ipc-server";
import { IPC_ServerConstructor_Argument } from "../../src/ipc-server/interface";
import { __sendResponse } from "../../src/ipc-server/ipc-server";

describe("__sendResponse", () => {
  const validResponse: any = Object.freeze({
    metadata: Object.freeze({ category: "general" }),
    payload: Object.values({ value: 1 }),
  });

  const delimiter = "\f";
  const socket: any = Object.freeze({
    write: jest.fn(),
    end: jest.fn(),
  });

  beforeEach(() => {
    Object.values(socket).forEach((method: any) => method.mockReset());
  });

  it.each([
    {
      response: { ...validResponse, metadata: { category: "unknown" } },
      case: "category is unknown",
      errorCode: "INVALID_RESPONSE_CATEGORY",
    },
    {
      response: { ...validResponse, payload: "not_an_object" },
      case: "payload is not an object",
      errorCode: "INVALID_RESPONSE_PAYLOAD",
    },
  ])(`throw ewc "$errorCode" if $case`, ({ response, errorCode }) => {
    expect.assertions(1);

    try {
      // @ts-ignore
      __sendResponse({ delimiter, response, socket, endConnection: false });
    } catch (ex) {
      expect(ex.code).toBe(errorCode);
    }
  });

  it(`writes the data to the socket`, () => {
    const sendResponseCallback = jest.fn();
    __sendResponse({
      socket,
      delimiter,
      endConnection: false,
      response: validResponse,
      callback: sendResponseCallback,
    });

    expect(socket.write).toHaveBeenCalledTimes(1);

    const [serializedData, socketWriteCallback] = socket.write.mock.calls[0];

    expect(serializedData).toEqual(expect.any(String));
    expect(serializedData.endsWith(delimiter)).toBeTruthy();

    expect(socketWriteCallback).toEqual(expect.any(Function));

    // calling the callback
    socketWriteCallback();

    // as endConnection is false
    expect(socket.end).not.toHaveBeenCalled();
    expect(sendResponseCallback).toHaveBeenCalledTimes(1);
  });

  it(`ends the socket after writing data to it if the "endConnection" flag is true`, () => {
    const sendResponseCallback = jest.fn();

    __sendResponse({
      socket,
      delimiter,
      endConnection: true,
      response: validResponse,
      callback: sendResponseCallback,
    });

    expect(socket.write).toHaveBeenCalledTimes(1);

    const [serializedData, socketWriteCallback] = socket.write.mock.calls[0];

    expect(serializedData).toEqual(expect.any(String));
    expect(serializedData.endsWith(delimiter)).toBeTruthy();

    expect(socketWriteCallback).toEqual(expect.any(Function));

    socketWriteCallback();

    // as endConnection is true
    expect(socket.end).toHaveBeenCalledTimes(1);
    expect(socket.end).toHaveBeenCalledWith(sendResponseCallback);
  });
});

describe("Constructor Arg validation", () => {
  const validArg: IPC_ServerConstructor_Argument = Object.freeze({
    delimiter: "\f",
    requestHandler: () => {},
    socketRoot: path.join(tmpdir(), "socket"),
  });

  it.each([
    {
      arg: { ...validArg, delimiter: "" },
      case: "delimiter is not a non_empty_string",
      errorCode: "INVALID_DELIMITER",
    },
    {
      arg: { ...validArg, delimiter: "not_a_char" },
      case: "delimiter is not a character",
      errorCode: "INVALID_DELIMITER:NOT_CHAR",
    },
    {
      arg: { ...validArg, requestHandler: ["not_a_function"] },
      case: "requestHandler is not a function",
      errorCode: "INVALID_REQUEST_HANDLER",
    },
    {
      arg: { ...validArg, socketRoot: "" },
      case: "socketRoot is not of type non_empty_string",
      errorCode: "INVALID_SOCKET_ROOT",
    },
  ])(`throws ewc "$errorCode" if $case`, ({ arg, errorCode }) => {
    expect.assertions(1);

    try {
      // @ts-ignore
      new IPC_Server(arg);
    } catch (ex) {
      expect(ex.code).toBe(errorCode);
    }
  });
});
