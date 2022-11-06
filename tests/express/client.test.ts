import { tmpdir } from "os";
import { createServer, Server, Socket } from "net";
import { randomUUID } from "crypto";
import { makeSocketPath } from "../../src/util";
import { defaults } from "../../src/express/defaults";
import { ExpressIPCClient } from "../../src/express/client";
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
