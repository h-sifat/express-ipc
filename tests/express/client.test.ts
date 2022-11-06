import { tmpdir } from "os";
import { createServer, Server, Socket } from "net";
import { randomUUID } from "crypto";
import { makeSocketPath } from "../../src/util";
import { defaults } from "../../src/express/defaults";
import {
  ExpressIPCClient,
  MANUAL_SOCKET_CLOSE_ERROR,
  SOCKET_ENDED_ERROR,
} from "../../src/express/client";
import { GeneralRequestResponse } from "../../src/interface";

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

describe("Handling Invalid Responses", () => {
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

describe("Error Handling", () => {
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
