import { createServer } from "net";

import {
  validateDelimiter,
  validateRequestPayload,
  validateRequestMetadata,
} from "./validator";
import { makeIPC_ServerClass } from "./ipc-server";
import { deleteSocketFile, makeSocketPath, splitDataIntoChunks } from "../util";

export const IPC_Server = makeIPC_ServerClass({
  createServer,
  makeSocketPath,
  deleteSocketFile,
  validateDelimiter,
  splitDataIntoChunks,
  validateRequestPayload,
  validateRequestMetadata,
});
