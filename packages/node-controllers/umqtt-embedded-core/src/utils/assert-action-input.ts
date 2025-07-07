import type {
  ActionElement,
  DataSchema,
} from "npm:wot-thing-description-types";
import { assert, assertEquals } from "jsr:@std/assert";

export function assertActionInput(
  actionElement: ActionElement,
  input: unknown,
): void {
  const schema = actionElement.input;

  if (!schema) {
    return assertEquals(input, undefined, "Action input should be undefined");
  }

  if ("const" in schema) {
    return assertEquals(input, schema.const, "Input must match constant value");
  }

  if ("oneOf" in schema && Array.isArray(schema.oneOf)) {
    return assertOneOfInput(schema.oneOf, input);
  }

  switch (schema.type) {
    case "null":
      assertEquals(input, null, "Input must be null");
      break;

    case "boolean":
      assert(typeof input === "boolean", "Input must be a boolean");
      assertEnumInput<boolean>(schema.enum, input);
      break;

    case "number":
      assert(typeof input === "number", "Input must be a number");
      assertNumberConstraints(schema, input);
      break;

    case "integer":
      assert(
        typeof input === "number" && Number.isInteger(input),
        "Input must be an integer",
      );
      assertNumberConstraints(schema, input);
      break;

    case "string":
      assert(typeof input === "string", "Input must be a string");
      assertStringConstraints(schema, input);
      break;

    case "object":
      assert(
        typeof input === "object" && input !== null && !Array.isArray(input),
        "Input must be a plain object",
      );
      assertObjectInput(schema, input);
      break;

    case "array":
      assert(Array.isArray(input), "Input must be an array");
      assertArrayInput(schema, input);
      break;

    default:
      throw new Error(`Unsupported input type: ${schema.type}`);
  }
}

function assertOneOfInput(
  schemas: DataSchema[],
  input: unknown,
): void {
  let validCount = 0;
  const errors: string[] = [];

  for (const schema of schemas) {
    try {
      assertActionInput({ input: schema } as ActionElement, input);
      validCount++;
    } catch (err) {
      errors.push((err as Error).message);
    }
  }

  assert(
    validCount === 1,
    `Input must match exactly one schema in 'oneOf', but matched ${validCount}.\nErrors:\n${
      errors.join(
        "\n",
      )
    }`,
  );
}

function assertEnumInput<T>(
  en: readonly unknown[] | undefined,
  input: T,
): void {
  if (en) {
    assert(en.includes(input), `Input must be one of: ${en.join(", ")}`);
  }
}

function assertNumberConstraints(
  schema: {
    minimum?: number;
    maximum?: number;
    multipleOf?: number;
    enum?: readonly unknown[];
  },
  input: number,
): void {
  if (schema.minimum) {
    assert(input >= schema.minimum, `Input must be >= ${schema.minimum}`);
  }

  if (schema.maximum) {
    assert(input <= schema.maximum, `Input must be <= ${schema.maximum}`);
  }

  if (schema.multipleOf) {
    assert(
      input % schema.multipleOf === 0,
      `Input must be a multiple of ${schema.multipleOf}`,
    );
  }

  assertEnumInput(schema.enum, input);
}

function assertStringConstraints(
  schema: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: readonly unknown[];
  },
  input: string,
): void {
  if (schema.minLength) {
    assert(
      input.length >= schema.minLength,
      `Input must be at least ${schema.minLength} characters long`,
    );
  }

  if (schema.maxLength) {
    assert(
      input.length <= schema.maxLength,
      `Input must be at most ${schema.maxLength} characters long`,
    );
  }

  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    assert(regex.test(input), `Input must match pattern: ${schema.pattern}`);
  }

  assertEnumInput(schema.enum, input);
}

function assertObjectInput(
  schema: {
    properties?: Record<string, ActionElement["input"]>;
    required?: string[];
  },
  input: unknown,
): void {
  assert(
    typeof input === "object" && input !== null && !Array.isArray(input),
    "Input must be a plain object",
  );

  const obj = input as Record<string, unknown>;

  // Check required properties
  if (schema.required) {
    for (const key of schema.required) {
      assert(
        key in obj,
        `Missing required property: ${key}`,
      );
    }
  }

  // Check individual property schemas
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj && propSchema) {
        assertActionInput({ input: propSchema } as ActionElement, obj[key]);
      }
    }
  }
}

function assertArrayInput(
  schema: {
    items?: DataSchema | DataSchema[];
    minItems?: number;
    maxItems?: number;
  },
  input: unknown,
): void {
  assert(Array.isArray(input), "Input must be an array");
  const arr = input as unknown[];

  if (schema.minItems !== undefined) {
    assert(
      arr.length >= schema.minItems,
      `Array must have at least ${schema.minItems} items`,
    );
  }

  if (schema.maxItems !== undefined) {
    assert(
      arr.length <= schema.maxItems,
      `Array must have at most ${schema.maxItems} items`,
    );
  }

  if (Array.isArray(schema.items)) {
    // **Tuple validation**: must be exact length
    const tupleSchemas = schema.items;
    assert(
      arr.length === tupleSchemas.length,
      `Array must have exactly ${tupleSchemas.length} items for this tuple schema`,
    );

    for (let i = 0; i < tupleSchemas.length; i++) {
      try {
        assertActionInput(
          { input: tupleSchemas[i] } as ActionElement,
          arr[i],
        );
      } catch (err) {
        throw new Error(
          `Invalid tuple item at index ${i}: ${(err as Error).message}`,
        );
      }
    }
  } else if (schema.items) {
    // **Homogeneous validation**
    for (let i = 0; i < arr.length; i++) {
      try {
        assertActionInput(
          { input: schema.items } as ActionElement,
          arr[i],
        );
      } catch (err) {
        throw new Error(
          `Invalid item at index ${i}: ${(err as Error).message}`,
        );
      }
    }
  }
}
