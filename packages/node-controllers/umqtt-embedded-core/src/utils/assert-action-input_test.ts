import type {
  DataSchema,
  FormElementBase,
} from "npm:wot-thing-description-types";
import { assertActionInput } from "./assert-action-input.ts";
import { assertThrows } from "jsr:@std/assert";

// Helpers
function makeAction(input: unknown) {
  return {
    input: input as DataSchema,
    forms: [] as unknown as [FormElementBase, ...FormElementBase[]],
  } as const;
}

Deno.test("should validate const", () => {
  assertActionInput(makeAction({ const: 42 }), 42);
  assertThrows(() => assertActionInput(makeAction({ const: 42 }), 24));
});

Deno.test("should validate enum", () => {
  assertActionInput(makeAction({ type: "string", enum: ["a", "b", "c"] }), "b");
  assertThrows(() =>
    assertActionInput(
      makeAction({ type: "string", enum: ["a", "b", "c"] }),
      "z",
    )
  );
});

Deno.test("should validate number constraints", () => {
  assertActionInput(
    makeAction({
      type: "number",
      minimum: 10,
      maximum: 20,
      multipleOf: 2,
    }),
    12,
  );

  assertThrows(() =>
    assertActionInput(makeAction({ type: "number", minimum: 10 }), 9)
  );
});

Deno.test("should validate integer", () => {
  assertActionInput(makeAction({ type: "integer" }), 7);
  assertThrows(() => assertActionInput(makeAction({ type: "integer" }), 7.5));
});

Deno.test("should validate boolean", () => {
  assertActionInput(makeAction({ type: "boolean" }), true);
  assertThrows(() =>
    assertActionInput(makeAction({ type: "boolean" }), "true")
  );
});

Deno.test("should validate null", () => {
  assertActionInput(makeAction({ type: "null" }), null);
  assertThrows(() =>
    assertActionInput(makeAction({ type: "null" }), undefined)
  );
});

Deno.test("should validate string", () => {
  assertActionInput(makeAction({ type: "string" }), "hello");
  assertThrows(() => assertActionInput(makeAction({ type: "string" }), 123));
});

Deno.test("should validate object with required properties", () => {
  assertActionInput(
    makeAction({
      type: "object",
      required: ["x"],
      properties: {
        x: { type: "number" },
        y: { type: "string" },
      },
    }),
    { x: 1, y: "foo" },
  );

  assertThrows(() =>
    assertActionInput(
      makeAction({
        type: "object",
        required: ["x"],
        properties: {
          x: { type: "number" },
          y: { type: "string" },
        },
      }),
      { y: "foo" },
    )
  );
});

Deno.test("should validate array with homogeneous schema", () => {
  assertActionInput(
    makeAction({
      type: "array",
      items: { type: "boolean" },
      minItems: 2,
      maxItems: 4,
    }),
    [true, false],
  );

  assertThrows(() =>
    assertActionInput(
      makeAction({
        type: "array",
        items: { type: "boolean" },
        minItems: 2,
      }),
      [true],
    )
  );

  assertThrows(() =>
    assertActionInput(
      makeAction({
        type: "array",
        items: { type: "boolean" },
      }),
      [true, "nope"],
    )
  );
});

Deno.test("should validate array with tuple schema", () => {
  assertActionInput(
    makeAction({
      type: "array",
      items: [
        { type: "string" },
        { type: "number" },
      ],
    }),
    ["hello", 123],
  );

  assertThrows(() =>
    assertActionInput(
      makeAction({
        type: "array",
        items: [
          { type: "string" },
          { type: "number" },
        ],
      }),
      ["hello", "not-a-number"],
    )
  );

  assertThrows(() =>
    assertActionInput(
      makeAction({
        type: "array",
        items: [
          { type: "string" },
          { type: "number" },
        ],
      }),
      ["too", "many", "items"],
    )
  );
});

Deno.test("should validate oneOf schema", () => {
  assertActionInput(
    makeAction({
      oneOf: [
        { type: "string", enum: ["a", "b"] },
        { type: "number", minimum: 10 },
      ],
    }),
    "b",
  );

  assertActionInput(
    makeAction({
      oneOf: [
        { type: "string", enum: ["a", "b"] },
        { type: "number", minimum: 10 },
      ],
    }),
    42,
  );

  assertThrows(() =>
    assertActionInput(
      makeAction({
        oneOf: [
          { type: "string", enum: ["a", "b"] },
          { type: "number", minimum: 10 },
        ],
      }),
      false,
    )
  );

  assertThrows(() =>
    assertActionInput(
      makeAction({
        oneOf: [
          { type: "number" },
          { type: "integer" },
        ],
      }),
      7,
    )
  );
});
