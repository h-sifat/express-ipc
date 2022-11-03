import fs from "fs";
import os from "os";
import { createServer } from "net";

import { makeSocketPath } from "../util";
import { makeIPC_ServerClass } from "./ipc-server";
import { validateRequestMetadata, validateRequestPayload } from "./validator";

export const IPC_Server = makeIPC_ServerClass({
  createServer,
  deleteSocketFile,
  validateRequestPayload,
  validateRequestMetadata,
  getSocketPath: makeSocketPath,
});

function deleteSocketFile(socketPath: string) {
  // in Windows, when a server closes, the socket is automatically deleted
  if (os.type() !== "Windows_NT") fs.rmSync(socketPath, { force: true });
}
