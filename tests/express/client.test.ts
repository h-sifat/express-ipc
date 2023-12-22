import {
  ExpressIPCClient,
  SOCKET_ENDED_ERROR,
  MANUAL_SOCKET_CLOSE_ERROR,
  ExpressIPCClientConstructor_Argument,
  REQUEST_TIMEOUT_ERROR,
} from "../../src/express/client";

import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { makeSocketPath } from "../../src/util";
import { createServer, Server, Socket } from "net";
import { defaults } from "../../src/express/defaults";
import { GeneralRequestResponse } from "../../src/interface";
import path from "path";

describe("Error Handling", () => {
  const socketPath = makeSocketPath({
    socketRoot: tmpdir(),
    path: { namespace: "testing_express_ipc_client", id: randomUUID() },
  });

  let server: Server;
  let serverSocket: Socket;
  let expressClient: ExpressIPCClient;

  beforeEach(async () => {
    await (() =>
      new Promise((resolve) => {
        server = createServer((_socket) => {
          serverSocket = _socket;
          resolve();
        });

        server.listen(socketPath, () => {
          expressClient = new ExpressIPCClient({ path: socketPath });
        });
      }) as Promise<void>)();
  });

  afterEach(() => {
    expressClient.close();
    server.close();
  });

  describe("Invalid Response", () => {
    {
      const errorCode = "INVALID_RESPONSE:NOT_JSON";
      it(`emits an error event with an ewc "${errorCode}" if the server responds with invalid json`, (done) => {
        expressClient.on("error", (error) => {
          try {
            expect(error).toMatchObject({
              code: errorCode,
              message: expect.any(String),
            });

            done();
          } catch (ex) {
            done(ex);
          }
        });

        serverSocket.write(`invalid_json${defaults.delimiter}`);
      });
    }

    {
      const errorCode = "INVALID_RESPONSE:UNKNOWN_ID";

      it(`emits an "unhandled_response" event with an ewc "${errorCode}" if server returns unknown id`, (done) => {
        const response: GeneralRequestResponse = Object.freeze({
          metadata: { id: "1424524", category: "general", isError: false },
          payload: { headers: {}, body: {} },
        });

        expressClient.on("unhandled_response", (data) => {
          try {
            expect(data.error).toMatchObject({
              code: errorCode,
              message: expect.any(String),
            });

            done();
          } catch (ex) {
            done(ex);
          }
        });

        serverSocket.write(`${JSON.stringify(response)}${defaults.delimiter}`);
      });

      for (const { method, args } of [
        {
          method: "request",
          args: [{ url: "/duck", method: "get" }, { timeout: 30 }],
        },
        { method: "get", args: ["/", { timeout: 30 }] },
        { method: "post", args: ["/", { timeout: 30 }] },
        { method: "patch", args: ["/", { timeout: 30 }] },
        { method: "delete", args: ["/", { timeout: 30 }] },
      ])
        it(`rejects request if it times out`, (done) => {
          jest.setTimeout(10_000);

          const response: GeneralRequestResponse = Object.freeze({
            metadata: { id: "1424524", category: "general", isError: false },
            payload: { headers: {}, body: {} },
          });

          expressClient.on("unhandled_response", (data) => {
            try {
              expect(data.error).toMatchObject({
                code: errorCode,
                message: expect.any(String),
              });

              done();
            } catch (ex) {
              done(ex);
            }
          });

          expressClient[method](...args).catch((error: any) => {
            expect(error.code).toBe(REQUEST_TIMEOUT_ERROR.code);
          });

          setTimeout(() => {
            serverSocket.write(
              `${JSON.stringify(response)}${defaults.delimiter}`
            );
          }, 200);
        });
    }
  });

  describe("Request timeout", () => {
    const setTimeoutMock = jest.fn();
    const clearTimeoutMock = jest.fn();

    let localExpressClient: ExpressIPCClient;

    beforeEach(() => {
      localExpressClient = new ExpressIPCClient({
        path: socketPath,
        setTimeout: setTimeoutMock,
        clearTimeout: clearTimeoutMock,
      });
    });

    afterEach(() => {
      localExpressClient.close();
    });

    it(`clears the timeout if response arrives in time`, (done) => {
      jest.setTimeout(10_000);
      const response: GeneralRequestResponse = Object.freeze({
        // the first request id will be 1
        metadata: { id: "1", category: "general", isError: false },
        payload: { headers: {}, body: {} },
      });

      const timeout = 100;
      const fakeTimerId = "timer";
      setTimeoutMock.mockReturnValueOnce(fakeTimerId);

      localExpressClient
        .request({ url: "/duck", method: "get" }, { timeout })
        .then((resp) => {
          try {
            expect(setTimeoutMock).toHaveBeenCalledTimes(1);
            expect(setTimeoutMock).toHaveBeenCalledWith(
              expect.any(Function),
              timeout
            );

            expect(clearTimeoutMock).toHaveBeenCalledTimes(1);
            expect(clearTimeoutMock).toHaveBeenCalledWith(fakeTimerId);

            done();
          } catch (ex) {
            done(ex);
          }
        })
        .catch((error) => {
          done(error);
        });

      setTimeout(() => {
        serverSocket.write(`${JSON.stringify(response)}${defaults.delimiter}`);
      }, 100);
    });
  });

  describe("Socket Error", () => {
    it(`rejects all enqueued requests if an error occurs`, (done) => {
      expressClient
        .get("/users")
        .then(() => {
          // the request should not resolve as we'll close the client
          try {
            expect(1).not.toBe(1);
            done();
          } catch (ex) {
            done(ex);
          }
        })
        .catch((error) => {
          try {
            expect(error).toMatchObject({
              code: MANUAL_SOCKET_CLOSE_ERROR.code,
              message: MANUAL_SOCKET_CLOSE_ERROR.message,
            });
            done();
          } catch (ex) {
            done(ex);
          }
        });

      // manually destroying the underlying client socket
      expressClient.close();
    });

    it(`rejects all enqueued requests if the socket connection is ended by the server`, (done) => {
      jest.setTimeout(10_000);

      expressClient
        .get("/users")
        .then(() => {
          // the request should not resolve as we'll end the socket
          try {
            expect(1).not.toBe(1);
            done();
          } catch (ex) {
            done(ex);
          }
        })
        .catch((error) => {
          try {
            expect(error).toMatchObject({
              code: SOCKET_ENDED_ERROR.code,
              message: SOCKET_ENDED_ERROR.message,
            });

            done();
          } catch (ex) {
            done(ex);
          }
        });

      // manually ending the client socket from the server side
      serverSocket.end();
    });
  });
});

describe("Constructor Arg validation", () => {
  const validArg: ExpressIPCClientConstructor_Argument = Object.freeze({
    delimiter: "\f",
    path: "/tmp/test.sock",
    socketRoot: path.join(tmpdir(), "socket"),
  });

  it.each([
    {
      arg: { ...validArg, delimiter: ["not_a_string"] },
      case: "delimiter is not a non_empty_string",
      errorCode: "INVALID_DELIMITER",
    },
    {
      arg: { ...validArg, delimiter: "not_a_char" },
      case: "delimiter is not a character",
      errorCode: "INVALID_DELIMITER:NOT_CHAR",
    },
    {
      arg: { ...validArg, socketRoot: 23241 },
      case: "socketRoot is not of type non_empty_string",
      errorCode: "INVALID_SOCKET_ROOT",
    },
    {
      arg: { ...validArg, path: "" },
      case: "path is not of type non_empty_string or plain_object",
      errorCode: "INVALID_PATH",
    },
    {
      arg: { ...validArg, path: null },
      case: "path is not of type non_empty_string or plain_object",
      errorCode: "INVALID_PATH",
    },
  ])(`throws ewc "$errorCode" if $case`, ({ arg, errorCode }) => {
    expect.assertions(1);

    try {
      // @ts-ignore
      new ExpressIPCClient(arg);
    } catch (ex) {
      expect(ex.code).toBe(errorCode);
    }
  });
});
