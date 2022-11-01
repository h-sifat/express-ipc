export class EPP extends Error {
  code: string;

  constructor(arg: { code: string; message: string }) {
    const { code, message } = arg;
    super(message);

    this.code = code;
  }
}

import { assert } from "handy-types";

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
