import { tmpdir } from "os";
import { IPC_Server } from "../../src/ipc-server";
import { IPC_ServerInterface } from "../../src/ipc-server/interface";

const delimiter = "\f";
const socketRoot = tmpdir();
const requestHandler = jest.fn();

let server: IPC_ServerInterface;

beforeEach(() => {
  requestHandler.mockReset();
  server = new IPC_Server({ delimiter, socketRoot, requestHandler });
});

afterEach(() => {
  server.close();
});

describe("create and delete Channels", () => {
  const errorCode = "INVALID_CHANNELS";

  it.each([
    { channels: [""] },
    { channels: ["a", [""]] },
    { channels: ["b", ["c", ["d"]]] },
  ])(
    `throws ewc "${errorCode}" if channel name(s) is/are not valid`,
    ({ channels }) => {
      expect.assertions(2);

      for (const method of ["createChannels", "deleteChannels"] as const)
        try {
          // @ts-ignore
          server[method](...channels);
        } catch (ex) {
          expect(ex.code).toBe(errorCode);
        }
    }
  );
});

describe("broadcast", () => {
  {
    const errorCode = "UNKNOWN_CHANNEL";
    it(`throws ewc "${errorCode}" if channel is not created`, async () => {
      expect.assertions(1);
      try {
        await server.broadcast({
          channel: "not_created_yet",
          data: { value: 1 },
        });
      } catch (ex) {
        expect(ex.code).toBe(errorCode);
      }
    });
  }

  {
    const errorCode = "INVALID_BROADCAST_DATA";

    it(`throws ewc "${errorCode}" if data is not of type non_null_object`, async () => {
      expect.assertions(1);

      const channel = "a";
      server.createChannels(channel);

      try {
        // @ts-ignore
        await server.broadcast({ channel, data: null });
      } catch (ex) {
        expect(ex.code).toBe(errorCode);
      }
    });
  }
});
