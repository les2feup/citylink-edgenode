import { RegistrationSchema } from "../src/types/zod/registration-schema.ts";
import { assertEquals, assertThrows } from "@std/assert";
import { z } from "zod";

Deno.test("valid registration with explicit tmOnly", () => {
  const input = {
    manifest: "https://example.com/manifest.json",
  };

  const result = RegistrationSchema.parse(input);
  assertEquals(result, input);
});

Deno.test("valid registration with default tmOnly", () => {
  const input = {
    manifest: "https://example.com/manifest.json",
  };

  const result = RegistrationSchema.parse(input);
  assertEquals(result.manifest, input.manifest);
});

Deno.test("throws when manifest is not a URL", () => {
  const input = {
    manifest: "invalid-url",
  };

  assertThrows(
    () => RegistrationSchema.parse(input),
    z.ZodError,
    "Invalid url",
  );
});
