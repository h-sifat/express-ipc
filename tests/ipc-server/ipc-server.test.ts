import EventEmitter from "events";
import path from "path";
import makeIPC_ServerClass from "../../src/ipc-server/ipc-server";

class FakeServer extends EventEmitter {
  #isClosed = false;
  #listenArg: { path: string; callback: any } | null = null;
  constructor() {
    super();
  }
  listen(path: string, callback: any) {
    if (this.#isClosed) throw new Error(`Cannot listen on a closed server.`);
    this.#listenArg = { path, callback };
    callback();
  }

  close() {
    this.#isClosed = true;
  }

  get isClosed() {
    return this.#isClosed;
  }

  get listenArg() {
    return this.#listenArg;
  }
}

class FakeSocket extends EventEmitter {
  #isDestroyed = false;
  #encoding: string | undefined = undefined;
  dataBuffer: string[] = [];

  write(data: string) {
    if (this.#isDestroyed) throw new Error(`Cannot write on destroyed socket.`);
    this.dataBuffer.push(data);
  }

  destroy() {
    this.#isDestroyed = true;
  }

  setEncoding(encoding: string) {
    this.#encoding = encoding;
  }

  get isDestroyed() {
    return this.#isDestroyed;
  }

  get encoding() {
    return this.#encoding;
  }
}

const builderArg = Object.freeze({
  rmSync: jest.fn(),
  createServer: jest.fn(),
  getSocketRoot: jest.fn(),
  makeSocketPath: jest.fn(),
  validateRequest: jest.fn(),
});
const resolvePath = path.resolve;
const requestHandler = jest.fn();

const DELIMITER = "\0";
const socketRoot = "/tmp";
const IPC_Server = makeIPC_ServerClass({ ...builderArg, resolvePath });

let ipcServer: InstanceType<typeof IPC_Server>;

beforeEach(() => {
  Object.values(builderArg).forEach((method) => method.mockReset());
  builderArg.createServer.mockImplementation(() => new FakeServer());

  ipcServer = new IPC_Server({
    socketRoot,
    requestHandler,
    delimiter: DELIMITER,
  });
});

describe("Server initialization", () => {
  it(`calls the createServer function and adds an "error" event listener on the created server`, () => {
    // resetting all mocks
    Object.values(builderArg).forEach((method) => method.mockReset());

    const fakeServer = new FakeServer();
    builderArg.createServer.mockReturnValueOnce(fakeServer);

    expect(fakeServer.listeners("error")).toHaveLength(0);

    new IPC_Server({
      requestHandler,
      socketRoot: "/tmp",
      delimiter: DELIMITER,
    });

    expect(fakeServer.listeners("error")).toHaveLength(1);

    expect(builderArg.createServer).toHaveBeenCalledTimes(1);
    expect(builderArg.createServer).toHaveBeenCalledWith(expect.any(Function));
  });
});

describe("listen", () => {
  it(`listens on the given path`, () => {
    expect(builderArg.createServer).toHaveBeenCalledTimes(1);
    const fakeServer = builderArg.createServer.mock.results[0].value;

    expect(fakeServer.listenArg).toBeNull();

    const path = "/tmp/app.sock";
    const callback = () => {};

    ipcServer.listen({ path, callback });

    expect(fakeServer.listenArg).toEqual({ path, callback });

    expect(builderArg.rmSync).not.toHaveBeenCalled();
    expect(builderArg.makeSocketPath).not.toHaveBeenCalled();
  });

  it(`creates the path if not provided from the given socketRoot, namespace, and id`, () => {
    const callback = () => {};
    const listenArg = Object.freeze({ id: "1", namespace: "pt" });

    const makeSocketPathReturnValue = "/duck";
    builderArg.makeSocketPath.mockReturnValueOnce(makeSocketPathReturnValue);
    ipcServer.listen({ ...listenArg, callback });

    expect(builderArg.rmSync).not.toHaveBeenCalled();
    expect(builderArg.makeSocketPath).toHaveBeenCalledTimes(1);
    expect(builderArg.makeSocketPath).toHaveBeenCalledWith({
      ...listenArg,
      socketRoot,
    });

    const fakeServer = builderArg.createServer.mock.results[0].value;
    expect(fakeServer.listenArg).toEqual({
      callback,
      path: makeSocketPathReturnValue,
    });
  });

  it(`deletes the socketPath before listening on it if the "deleteSocketIfExists" flag is true`, () => {
    const path = "/tmp/app.sock";
    const callback = () => {};

    ipcServer.listen({ path, callback, deleteSocketIfExists: true });

    expect(builderArg.rmSync).toHaveBeenCalledTimes(1);
    expect(builderArg.rmSync).toHaveBeenCalledWith(path, { force: true });

    expect(builderArg.makeSocketPath).not.toHaveBeenCalled();
  });
});

describe("handling connections", () => {
  it(`sets up all the event listeners and encoding when a socket connects to server`, () => {
    expect(builderArg.createServer).toHaveBeenCalledTimes(1);

    // builderArg.createServer(
    //   (socket) => { } // this is the connectionHandler created by the IPC_Server class
    // )

    const connectionHandler = builderArg.createServer.mock.calls[0][0];

    const socket = new FakeSocket();
    connectionHandler(socket);

    expect(socket.encoding).toBe("utf8");
    expect(socket.listeners("end")).toHaveLength(1);
    expect(socket.listeners("data")).toHaveLength(1);
    expect(socket.listeners("error")).toHaveLength(1);
    expect(socket.listeners("close")).toHaveLength(1);
  });
});
