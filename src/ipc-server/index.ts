import fs from "fs";
import os from "os";
import path from "path";
import { createServer } from "net";
import { validateRequest } from "./validator";
import { makeIPC_ServerClass, MakeSocketPath_Argument } from "./ipc-server";

export const IPC_Server = makeIPC_ServerClass({
  createServer,
  validateRequest,
  deleteSocketFile,
  resolvePath: path.resolve,
  getSocketPath: makeSocketPath,
  getSocketRoot: () => os.tmpdir(),
});

function deleteSocketFile(socketPath: string) {
  // in Windows, when a server closes, the socket is automatically deleted
  if (os.type() !== "Windows_NT") fs.rmSync(socketPath, { force: true });
}

function makeSocketPath(arg: MakeSocketPath_Argument): string {
  const { id, namespace, socketRoot } = arg;

  const socketPath = path.join(socketRoot, `${namespace}_${id}`);

  return os.type() === "Windows_NT"
    ? path.join("\\\\?\\pipe", socketPath)
    : socketPath;
}
