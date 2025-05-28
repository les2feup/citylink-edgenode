import { AppContentTypes, AppManifest } from "../src/types/zod/app-manifest.ts";
import { z } from "npm:zod";
import { assertEquals, assertThrows } from "jsr:@std/assert";

Deno.test("AppContentTypes accepts valid types", () => {
  assertEquals(AppContentTypes.parse({ foo: 42 }), { foo: 42 });
  assertEquals(AppContentTypes.parse("some text"), "some text");
  assertEquals(
    AppContentTypes.parse(new Uint8Array([1, 2, 3])),
    new Uint8Array([1, 2, 3]),
  );
});

Deno.test("AppManifest parses valid manifest", () => {
  const manifest: AppManifest = {
    download: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        contentType: "binary",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: {
        title: "Device TM",
        href: "https://example.com/tm.jsonld",
        version: {
          instance: "1.0.0",
          model: "1.0.0",
        },
      },
    },
  };

  const parsed = AppManifest.parse(manifest);
  assertEquals(parsed, manifest);
});

Deno.test("AppManifest uses default contentType if not specified", () => {
  const manifest = {
    download: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: {
        href: "https://example.com/tm.jsonld",
        version: {
          instance: "1.0.0",
          model: "1.0.0",
        },
      },
    },
  };

  const parsed = AppManifest.parse(manifest);
  assertEquals(parsed.download[0].contentType, "binary");
});

Deno.test("AppManifest throws when download array is empty", () => {
  const manifest = {
    download: [],
    wot: {
      tm: {
        href: "https://example.com/tm.jsonld",
        version: {
          instance: "1.0.0",
          model: "1.0.0",
        },
      },
    },
  };

  assertThrows(
    () => AppManifest.parse(manifest),
    z.ZodError,
    "At least one download item is required",
  );
});

Deno.test("AppManifest throws on invalid download URL", () => {
  const manifest = {
    download: [
      {
        filename: "firmware.bin",
        url: "not-a-url",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: {
        href: "https://example.com/tm.jsonld",
        version: {
          instance: "1.0.0",
          model: "1.0.0",
        },
      },
    },
  };

  assertThrows(
    () => AppManifest.parse(manifest),
    z.ZodError,
    "Invalid url",
  );
});

Deno.test("AppManifest throws on invalid contentType", () => {
  const manifest = {
    download: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        contentType: "invalid-type",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: {
        href: "https://example.com/tm.jsonld",
        version: {
          instance: "1.0.0",
          model: "1.0.0",
        },
      },
    },
  };

  assertThrows(
    () => AppManifest.parse(manifest),
    z.ZodError,
    "Invalid enum value. Expected 'json' | 'text' | 'binary', received 'invalid-type'",
  );
});

Deno.test("AppManifest throws on invalid sha256 format", () => {
  const manifest: AppManifest = {
    download: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        contentType: "binary",
        sha256: "adsd",
      },
    ],
    wot: {
      tm: {
        title: "Device TM",
        href: "https://example.com/tm.jsonld",
        version: {
          instance: "1.0.0",
          model: "1.0.0",
        },
      },
    },
  };

  assertThrows(
    () => AppManifest.parse(manifest),
    z.ZodError,
    "invalid_string",
  );
});
