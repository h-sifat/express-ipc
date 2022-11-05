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
    __sendResponse({
      socket,
      delimiter,
      endConnection: false,
      response: validResponse,
    });

    expect(socket.write).toHaveBeenCalledTimes(1);

    const [serializedData, callback] = socket.write.mock.calls[0];

    expect(serializedData).toEqual(expect.any(String));
    expect(serializedData.endsWith(delimiter)).toBeTruthy();

    expect(callback).toEqual(expect.any(Function));

    // calling the callback
    callback();

    // as endConnection is false
    expect(socket.end).not.toHaveBeenCalled();
  });

  it(`ends the socket after writing data to it if the "endConnection" flag is true`, () => {
    __sendResponse({
      socket,
      delimiter,
      endConnection: true,
      response: validResponse,
    });

    expect(socket.write).toHaveBeenCalledTimes(1);

    const [serializedData, callback] = socket.write.mock.calls[0];

    expect(serializedData).toEqual(expect.any(String));
    expect(serializedData.endsWith(delimiter)).toBeTruthy();

    expect(callback).toEqual(expect.any(Function));

    // calling the callback
    callback();

    // as endConnection is false
    expect(socket.end).toHaveBeenCalled();
  });
});
