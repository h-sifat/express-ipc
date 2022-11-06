import {
  ExpressIPCClient,
  SOCKET_ENDED_ERROR,
  MANUAL_SOCKET_CLOSE_ERROR,
  ExpressIPCClientConstructor_Argument,
} from "../../src/express/client";

import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { makeSocketPath } from "../../src/util";
import { createServer, Server, Socket } from "net";
import { defaults } from "../../src/express/defaults";
import { GeneralRequestResponse } from "../../src/interface";
import path from "path";

describe("Error Handline", () => {
  const socketPath = makeSocketPath({
    socketRoot: tmpdir(),
    path: { namespace: "testing_express_ipc_client", id: randomUUID() },
  });

  let server: Server;
  let clientSocket: Socket;
  let expressClient: ExpressIPCClient;

  beforeAll(async () => {
    await (() =>
      new Promise((resolve) => {
        server = createServer((_socket) => {
          clientSocket = _socket;
          resolve();
        });

        server.listen(socketPath, () => {
          expressClient = new ExpressIPCClient({ path: socketPath });
        });
      }) as Promise<void>)();
  });

  beforeEach(() => {
    clientSocket.removeAllListeners("end");
    clientSocket.removeAllListeners("data");
    clientSocket.removeAllListeners("close");
    clientSocket.removeAllListeners("error");

    expressClient.removeAllListeners("error");
  });

  afterAll(() => {
    server.close();
    expressClient.close();
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

        clientSocket.write(`invalid_json${defaults.delimiter}`);
      });
    }

    {
      const errorCode = "INVALID_RESPONSE:UNKNOWN_ID";

      it(`emits an error event with an ewc "${errorCode}" if the server responds with unknown request id`, (done) => {
        const response: GeneralRequestResponse = Object.freeze({
          metadata: { id: "1424524", category: "general", isError: false },
          payload: { headers: {}, body: {} },
        });

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

        clientSocket.write(`${JSON.stringify(response)}${defaults.delimiter}`);
      });
    }
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
      clientSocket.end();
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
