import { randomUUID } from "crypto";
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
