import { createServer } from "net";

import {
  validateDelimiter,
  validateRequestPayload,
  validateRequestMetadata,
} from "./validator";
import {
  makeSocketPath,
  deleteSocketFile,
  splitDataIntoChunks,
  flattenAndValidateChannelArgs,
} from "../util";
import { makeIPC_ServerClass } from "./ipc-server";

export const IPC_Server = makeIPC_ServerClass({
  createServer,
  makeSocketPath,
  deleteSocketFile,
  validateDelimiter,
  splitDataIntoChunks,
  validateRequestPayload,
  validateRequestMetadata,
  flattenAndValidateChannelArgs,
});
