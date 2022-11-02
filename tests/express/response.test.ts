import { Response } from "../../src/express/response";

const connectionId = 123;
const sendResponse = jest.fn();

let response: Response;

beforeEach(() => {
  response = new Response({ connectionId, sendResponse });
  sendResponse.mockReset();
});

describe("getter isSent", () => {
  it(`returns false if the response is not sent yet`, () => {
    expect(response.isSent).toBeFalsy();
  });

  it(`returns true if the response is sent`, () => {
    response.send({ a: 1 });
    expect(response.isSent).toBeTruthy();
  });
});

describe("send", () => {
  const data = Object.freeze({ value: 1 });
  const error = Object.freeze({ message: "invalid id", code: "INVALID_ID" });
  {
    it.each([
      {
        sendArgs: [data],
        expectedSendResponseArg: {
          data,
          error: null,
          connectionId,
          type: "general",
          endConnection: false,
        },
      },
      {
        sendArgs: [error, { isError: true, endConnection: true }],
        expectedSendResponseArg: {
          error,
          data: null,
          connectionId,
          type: "general",
          endConnection: true,
        },
      },
    ])(
      `sends the appropriate response based on the given arguments`,
      ({ sendArgs, expectedSendResponseArg }) => {
        // @ts-ignore
        response.send(...sendArgs);

        expect(sendResponse).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith(expectedSendResponseArg);
      }
    );
  }

  {
    const errorCode = "RESPONSE_ALREADY_SENT";
    it(`throws ewc "${errorCode}" if the send method is called twice`, () => {
      expect.assertions(1);

      response.send(data);

      try {
        response.send(data);
      } catch (ex) {
        expect(ex.code).toBe(errorCode);
      }
    });
  }
});