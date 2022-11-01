import { cache as schemaCache } from "handy-types";
import { makeGenerator, validate, ValidatorSchema } from "../../src/util";

describe("validate", () => {
  type User = {
    age: number;
    name: string;
    phone?: string;
  };

  const schema: Readonly<ValidatorSchema<User>> = Object.freeze({
    age: "number",
    name: "string",
    phone: { type: "string", required: false },
  } as const);

  const validObject = Object.freeze({
    age: 41,
    name: "Karen",
    hobbies: ["coding"],
  });

  const otherValidatorArg = Object.freeze({
    schema,
    name: "user",
  });

  it.each([
    {
      object: null,
      case: "object is not a plain object",
      errorCode: "NOT_PLAIN_OBJECT",
    },
    {
      object: [],
      case: "object is not a plain object",
      errorCode: "NOT_PLAIN_OBJECT",
    },
    {
      object: { ...validObject, name: 1421 },
      case: "any property is invalid",
      errorCode: "INVALID_PROPERTY",
    },
    {
      object: { ...validObject, duck: 1421 },
      case: "object contains unknown properties",
      errorCode: "UNKNOWN_PROPERTY",
    },
    {
      object: { ...validObject, phone: 1421 },
      case: "optional property is invalid",
      errorCode: "INVALID_PROPERTY",
    },
  ])(`it throws ewc "$errorCode" if $case`, ({ object, errorCode }) => {
    expect.assertions(1);
    try {
      validate(object, otherValidatorArg);
    } catch (ex) {
      expect(ex.code).toBe(errorCode);
    }
  });

  it(`caches an schema if the "cache" flag is true`, () => {
    expect(schemaCache.size).toBe(0);

    const schema = {
      hobbies: { type: "non_empty_string[]", required: true, cache: true },
    };
    validate({ hobbies: [] }, { schema, name: "object" });

    expect(schemaCache.size).toBe(1);
  });
});

describe("makeGenerator", () => {
  it(`makes returns a generator of the given array`, () => {
    const array = Object.freeze([1, 2, 3]);
    const generator = makeGenerator(array as any);

    for (const element of array) expect(generator.next().value).toBe(element);

    expect(generator.next().done).toBeTruthy();
  });
});
