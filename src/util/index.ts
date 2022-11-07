import os from "os";
import fs from "fs";
import { assert } from "handy-types";
import { join as joinPath } from "path";

import { validateSocketPath } from "../ipc-server/validator";

import type { GeneralRequestPayload } from "../interface";
import type { ExpressRequest } from "../express/interface";
import type { MakeSocketPath_Argument } from "../ipc-server/ipc-server";
import type {
  FlattenAndValidateChannelArgs,
  SplitDataIntoChunks,
} from "./interface";

export class EPP extends Error {
  code: string;

  constructor(arg: { code: string; message: string }) {
    const { code, message } = arg;
    super(message);

    this.code = code;
  }
}

type ObjectSchemaType = { type: string; required: boolean; cache?: boolean };

export type ValidatorSchema<Type extends object> = {
  [key in keyof Type]: string | ObjectSchemaType;
};

interface OtherValidatorArgument<Type extends object> {
  name: string;
  schema: ValidatorSchema<Type>;
}

export function validate<Type extends object>(
  object: unknown,
  otherArg: OtherValidatorArgument<Type>
): asserts object is Type {
  const { name: objectName, schema } = otherArg;

  assert<object>("plain_object", object, {
    code: "NOT_PLAIN_OBJECT",
    message: `"${objectName}" must be a plain object.`,
  });

  const allObjectProperties = new Set(Object.keys(object as any));

  for (const [property, propertySchema] of Object.entries(schema)) {
    const {
      required,
      cache: cacheSchema,
      type: propertyType,
    } = (() =>
      typeof propertySchema === "string"
        ? { type: propertySchema, required: true, cache: false }
        : <ObjectSchemaType>propertySchema)();

    allObjectProperties.delete(property);

    if (!(property in <any>object)) {
      if (!required) continue;

      throw new EPP({
        code: "MISSING_PROPERTY",
        message: `Missing property "${property}" in ${objectName}`,
      });
    }

    {
      const error = {
        code: "INVALID_PROPERTY",
        message: `"${objectName}.${property}" must be of type ${propertyType}`,
      };

      if (cacheSchema)
        assert.cache(propertyType, (object as any)[property], error);
      else assert(propertyType, (object as any)[property], error);
    }
  }

  for (const unknownProperty of allObjectProperties.values())
    throw new EPP({
      code: "UNKNOWN_PROPERTY",
      message: `Unknown property "${unknownProperty}" in ${objectName}`,
    });
}

export function* makeGenerator<Type>(array: Type[]): Generator<Type> {
  for (const route of array) yield route;
}

export function normalizeRawRequest(arg: {
  excludeProperties?: string[];
  rawRequest: GeneralRequestPayload;
}): ExpressRequest {
  const { rawRequest, excludeProperties = [] } = arg;

  const request: Partial<ExpressRequest> = {
    path: "/",
    params: {},
  };

  for (const property of Object.keys(rawRequest))
    if (!excludeProperties.includes(property))
      Object.defineProperty(request, property, {
        writable: false,
        enumerable: true,
        configurable: false,
        value: rawRequest[property],
      });

  return request as ExpressRequest;
}

export function makeSocketPath(arg: MakeSocketPath_Argument): string {
  const WINDOWS_SOCKET_PREFIXES = ["\\\\?\\pipe", "\\\\.\\pipe"];
  const { path, socketRoot } = arg;

  validateSocketPath(path);

  const socketPath =
    typeof path === "string"
      ? path
      : joinPath(socketRoot, `${path.namespace}_${path.id}`);

  if (os.type() === "Windows_NT") {
    for (const prefix of WINDOWS_SOCKET_PREFIXES)
      if (socketPath.startsWith(prefix)) return socketPath;
    return joinPath(WINDOWS_SOCKET_PREFIXES[0], socketPath);
  }

  return socketPath;
}

export function isErrorMiddleware(middleware: Function): boolean {
  // (resAndReq, error) => any
  return middleware.length === 2;
}

export const splitDataIntoChunks: SplitDataIntoChunks = function (arg) {
  const { data, delimiter } = arg;

  const chunks = data.split(delimiter);

  // meaning that the current-chunk hasn't terminated yet.
  if (chunks.length <= 1) return { residue: data, chunks: [] };

  // the last element holds the most recent chunk's
  // unterminated data or an empty string ("").
  const residue = chunks.pop()!;

  return { chunks, residue };
};

export function deleteSocketFile(socketPath: string) {
  // in Windows, when a server closes, the socket is automatically deleted
  if (os.type() !== "Windows_NT") fs.rmSync(socketPath, { force: true });
}

export const flattenAndValidateChannelArgs: FlattenAndValidateChannelArgs =
  function (channelsRestArg) {
    const channels = channelsRestArg.flat();
    assert.cache<string[]>("non_empty_string[]", channels, {
      code: "INVALID_CHANNELS",
      message: `channel name must of type non-empty string.`,
    });

    return channels;
  };
