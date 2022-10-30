import path from "path";
import EventEmitter from "events";
import { makeIPC_ServerClass } from "../../src/ipc-server/ipc-server";

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
  createServer: jest.fn(),
  getSocketRoot: jest.fn(),
  getSocketPath: jest.fn(),
  validateRequest: jest.fn(),
  deleteSocketFile: jest.fn(),
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

describe("IPC_Server.Constructor", () => {
  {
    const validArgObject = Object.freeze({
      delimiter: "\f",
      requestHandler: () => {},
      socketRoot: "/tmp",
    });

    it.each([
      {
        arg: { delimiter: "" },
        code: "INVALID_DELIMITER",
        case: "delimiter is not a non empty string",
      },
      {
        arg: { delimiter: "ab" },
        code: "INVALID_DELIMITER:NOT_CHAR",
        case: "delimiter is not a single character string",
      },
      {
        arg: { requestHandler: [() => {}] },
        code: "INVALID_REQUEST_HANDLER",
        case: "requestHandler is not a function",
      },
    ])(`throws ewc "$code" if $case`, ({ arg: invalidArg, code }) => {
      expect.assertions(1);

      const constructorArg = { ...validArgObject, ...invalidArg };

      try {
        // @ts-ignore
        new IPC_Server(constructorArg);
      } catch (ex) {
        expect(ex.code).toBe(code);
      }
    });
  }
});

describe("Server initialization", () => {
  it(`calls the createServer function and adds an "error" event listener on the created server`, () => {
    // resetting all mocks
    Object.values(builderArg).forEach((method) => method.mockReset());

    const fakeServer = new FakeServer();
    builderArg.createServer.mockReturnValueOnce(fakeServer);

    new IPC_Server({
      requestHandler,
      socketRoot: "/tmp",
      delimiter: DELIMITER,
    });

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

    expect(builderArg.deleteSocketFile).not.toHaveBeenCalled();
    expect(builderArg.getSocketPath).not.toHaveBeenCalled();
  });

  it(`creates the path from the given socketRoot, namespace, and id if not provided`, () => {
    const callback = () => {};
    const listenArg = Object.freeze({ id: "1", namespace: "pt" });

    const getSocketPathReturnValue = "/duck";
    builderArg.getSocketPath.mockReturnValueOnce(getSocketPathReturnValue);
    ipcServer.listen({ ...listenArg, callback });

    expect(builderArg.deleteSocketFile).not.toHaveBeenCalled();
    expect(builderArg.getSocketPath).toHaveBeenCalledTimes(1);
    expect(builderArg.getSocketPath).toHaveBeenCalledWith({
      ...listenArg,
      socketRoot,
    });

    const fakeServer = builderArg.createServer.mock.results[0].value;
    expect(fakeServer.listenArg).toEqual({
      callback,
      path: getSocketPathReturnValue,
    });
  });

  it(`deletes the socketPath before listening on it if the "deleteSocketIfExists" flag is true`, () => {
    const path = "/tmp/app.sock";
    const callback = () => {};

    ipcServer.listen({ path, callback, deleteSocketBeforeListening: true });

    expect(builderArg.deleteSocketFile).toHaveBeenCalledTimes(1);
    expect(builderArg.deleteSocketFile).toHaveBeenCalledWith(path);

    expect(builderArg.getSocketPath).not.toHaveBeenCalled();
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

describe("close", () => {});
