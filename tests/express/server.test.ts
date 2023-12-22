import { Socket } from "net";
import { randomUUID } from "crypto";
import { createConnection } from "net";
import { defaults } from "../../src/express/defaults";
import { ExpressIPCClient } from "../../src/express/client";
import { ExpressIPCServer } from "../../src/express/server";

const namespace = "express-ipc-test";
const id = randomUUID();

const urls = Object.freeze({
  get_id: "/get/:id",
  get_req_next: "/get_next",
  app_level_use: "/test_app_level_use",
});

const sampleData = {
  res_header: { name: "test", value: "it works!" },
  app_level_use_response: { sent_by: "app_level_middleware" },
};

// -------- setting up server -----------------
const server = new ExpressIPCServer();

server.use(({ req, res, next }) => {
  if (req.url !== urls.app_level_use) return next();

  res.send(sampleData.app_level_use_response);
});

server.get(urls.get_id, ({ req, res }) => {
  res.send(req.params);
});

server.get(urls.get_req_next, [
  ({ next }) => next(),
  ({ req, res }) => {
    res.headers[sampleData.res_header.name] = sampleData.res_header.value;
    res.send(req);
  },
]);

server.listen({ path: { namespace, id } });

// -------- end setting up server -----------------

// --------- setting up client -------------------
const client = new ExpressIPCClient({ path: { namespace, id } });
// --------- end setting up client -------------------

afterAll(() => {
  server.close();
  client.close();
});

describe("get", () => {
  it(`can parse parameters`, async () => {
    const id = "12";
    const url = `/get/${id}`;

    const response = await client.get(url);
    expect(response).toEqual({ headers: {}, body: { id } });
  });

  it(`can send headers, body, and query with the request`, async () => {
    const otherArgs = {
      headers: { ContentType: "application/json" },
      query: { what: "it works?", ans: "yes!" },
      body: { isFat: true },
    };

    const response = await client.get(urls.get_req_next, otherArgs);
    expect(response).toEqual({
      headers: { [sampleData.res_header.name]: sampleData.res_header.value },
      body: {
        params: {},
        ...otherArgs,
        method: "get",
        url: urls.get_req_next,
        path: urls.get_req_next,
      },
    });
  });
});

describe("app_level_use", () => {
  it(`can send response and stop further propagation`, async () => {
    const response = await client.delete(urls.app_level_use);
    expect(response).toEqual({
      headers: {},
      body: sampleData.app_level_use_response,
    });
  });
});

describe("broadcast", () => {
  const channel = "test";
  const broadcastData = { message: "can you hear me?" };

  beforeAll(async () => {
    server.createChannels(channel);
    await client.subscribe(channel);
  });

  afterAll(async () => {
    server.deleteChannels(channel);
    await client.unsubscribe(channel);
  });

  it(`can broadcast data`, (done) => {
    client.on("broadcast", (arg) => {
      try {
        expect(arg).toEqual({
          data: broadcastData,
          channel: channel,
        });
        done();
      } catch (ex) {
        done(ex);
      } finally {
        client.removeAllListeners("broadcast");
      }
    });

    server.broadcast({
      channel: channel,
      data: broadcastData,
    });
  });
});

describe("Handling Invalid Requests", () => {
  let socket: Socket;

  const parseRequestData = (buffer: Buffer) => {
    const data = buffer.toString().slice(0, -1);
    return JSON.parse(data);
  };

  const serializeResponse = (response: any) =>
    JSON.stringify(response) + defaults.delimiter;

  beforeEach(async () => {
    await (() =>
      new Promise((resolve) => {
        socket = createConnection({ path: server.socketPath! }, () => {
          resolve();
        });
      }) as Promise<void>)();
  });

  afterEach(() => {
    socket.destroy();
  });

  {
    const errorCode = "INVALID_JSON";
    it(`returns error response (with code "${errorCode}") if request is not a valid json`, (done) => {
      socket.write(`invalid json data${defaults.delimiter}`);

      socket.on("data", (buffer: Buffer) => {
        try {
          const response = parseRequestData(buffer);

          expect(response).toEqual({
            metadata: {
              isError: true,
              category: "general",
              id: expect.any(String),
            },
            payload: {
              headers: {},
              body: { code: errorCode, message: expect.any(String) },
            },
          });

          done();
        } catch (ex) {
          done(ex);
        }
      });
    });
  }
  {
    it(`returns error response if metadata is invalid`, (done) => {
      const id = "123";
      const request = {
        metadata: { id, category: "invalid_req_category" },
        payload: {},
      };

      socket.on("data", (buffer) => {
        try {
          const response = parseRequestData(buffer);

          expect(response).toEqual({
            metadata: {
              id,
              isError: true,
              category: "general",
            },
            payload: {
              headers: {},
              body: {
                code: "INVALID_REQUEST_CATEGORY",
                message: expect.any(String),
              },
            },
          });

          done();
        } catch (ex) {
          done(ex);
        }
      });

      socket.write(serializeResponse(request));
    });
  }

  {
    it(`returns error response if payload is invalid`, (done) => {
      const id = "123";
      const request = {
        metadata: { id, category: "subscribe" },
        payload: { channels: [""] },
      };

      socket.on("data", (buffer: Buffer) => {
        try {
          const response = parseRequestData(buffer);

          expect(response).toEqual({
            metadata: { ...request.metadata, isError: true },
            payload: {
              headers: {},
              body: {
                message: expect.any(String),
                code: "INVALID_PROPERTY",
              },
            },
          });

          done();
        } catch (ex) {
          done(ex);
        }
      });

      socket.write(serializeResponse(request));
    });
  }
});
