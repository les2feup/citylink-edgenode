import {
  AppContentTypes,
  type AppManifest,
  type CoreManifest,
  type FullManifest,
  Manifest,
} from "../src/types/zod/manifest.ts";
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
    type: "App",
    source: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        contentType: "binary",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  const parsed = Manifest.parse(manifest);
  assertEquals(parsed, manifest);
});

Deno.test("AppManifest uses default contentType if not specified", () => {
  const manifest = {
    type: "App" as const,
    source: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  const parsed = Manifest.parse(manifest);
  if (parsed.type === "App") {
    assertEquals(parsed.source[0].contentType, "binary");
  }
});

Deno.test("AppManifest throws when source array is empty", () => {
  const manifest = {
    type: "App" as const,
    source: [],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "At least one download item is required",
  );
});

Deno.test("AppManifest throws on invalid source URL", () => {
  const manifest = {
    type: "App" as const,
    source: [
      {
        filename: "firmware.bin",
        url: "not-a-url",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "Invalid url",
  );
});

Deno.test("AppManifest throws on invalid contentType", () => {
  const manifest = {
    type: "App" as const,
    source: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        contentType: "invalid-type" as "json" | "text" | "binary",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "Invalid enum value. Expected 'json' | 'text' | 'binary', received 'invalid-type'",
  );
});

Deno.test("AppManifest throws on invalid sha256 format", () => {
  const manifest: AppManifest = {
    type: "App",
    source: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        contentType: "binary",
        sha256: "adsd",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "invalid_string",
  );
});

Deno.test("AppManifest throws on invalid WoT tm URL", () => {
  const manifest = {
    type: "App" as const,
    source: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "not-a-url",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "Invalid url",
  );
});

Deno.test("AppManifest accepts optional coreManifest URL", () => {
  const manifest: AppManifest = {
    type: "App",
    coreManifest: "https://example.com/core.json",
    source: [
      {
        filename: "firmware.bin",
        url: "https://example.com/fw.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
        contentType: "json",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  const parsed = Manifest.parse(manifest);
  assertEquals(parsed, manifest);
});

// CoreManifest Tests
Deno.test("CoreManifest parses valid manifest", () => {
  const manifest: CoreManifest = {
    type: "EmbeddedCore",
    source: [
      {
        filename: "core.bin",
        url: "https://example.com/core.bin",
        contentType: "binary",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
    removeApp: false,
  };
  const parsed = Manifest.parse(manifest);
  assertEquals(parsed, manifest);
});

Deno.test("CoreManifest uses default removeApp if not specified", () => {
  const manifest = {
    type: "EmbeddedCore" as const,
    source: [
      {
        filename: "core.bin",
        url: "https://example.com/core.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  const parsed = Manifest.parse(manifest);
  if (parsed.type === "EmbeddedCore") {
    assertEquals(parsed.removeApp, false);
  }
});

Deno.test("CoreManifest accepts removeApp true", () => {
  const manifest: CoreManifest = {
    type: "EmbeddedCore",
    removeApp: true,
    source: [
      {
        filename: "core.bin",
        url: "https://example.com/core.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
        contentType: "json",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  const parsed = Manifest.parse(manifest);
  if (parsed.type === "EmbeddedCore") {
    assertEquals(parsed.removeApp, true);
  }
});

Deno.test("CoreManifest throws when source array is empty", () => {
  const manifest = {
    type: "EmbeddedCore" as const,
    source: [],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "At least one download item is required",
  );
});

// FullManifest Tests
Deno.test("FullManifest parses valid manifest", () => {
  const manifest: FullManifest = {
    type: "Full",
    source: {
      core: [
        {
          filename: "core.bin",
          url: "https://example.com/core.bin",
          contentType: "binary",
          sha256:
            "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
        },
      ],
      app: [
        {
          filename: "app.bin",
          url: "https://example.com/app.bin",
          contentType: "binary",
          sha256:
            "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678",
        },
      ],
    },
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  const parsed = Manifest.parse(manifest);
  assertEquals(parsed, manifest);
});

Deno.test("FullManifest throws when core array is empty", () => {
  const manifest = {
    type: "Full" as const,
    source: {
      core: [],
      app: [
        {
          filename: "app.bin",
          url: "https://example.com/app.bin",
          sha256:
            "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678",
        },
      ],
    },
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "At least one download item is required",
  );
});

Deno.test("FullManifest throws when app array is empty", () => {
  const manifest = {
    type: "Full" as const,
    source: {
      core: [
        {
          filename: "core.bin",
          url: "https://example.com/core.bin",
          sha256:
            "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
        },
      ],
      app: [],
    },
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "At least one download item is required",
  );
});

Deno.test("FullManifest accepts multiple items in core and app arrays", () => {
  const manifest: FullManifest = {
    type: "Full",
    source: {
      core: [
        {
          filename: "core1.bin",
          url: "https://example.com/core1.bin",
          contentType: "binary",
          sha256:
            "123456789012345678901234567890123456789012345678901234567890abcd",
        },
        {
          filename: "core2.bin",
          url: "https://example.com/core2.bin",
          contentType: "binary",
          sha256:
            "a1b2c3d4e5f67890123456789012345678901234567890123456789012345678",
        },
      ],
      app: [
        {
          filename: "app1.bin",
          url: "https://example.com/app1.bin",
          contentType: "binary",
          sha256:
            "fedcba0987654321098765432109876543210987654321098765432109876543",
        },
        {
          filename: "app2.json",
          url: "https://example.com/app2.json",
          contentType: "binary",
          sha256:
            "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
        },
      ],
    },
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  const parsed = Manifest.parse(manifest);
  assertEquals(parsed, manifest);
});

// Discriminated Union Tests
Deno.test("Manifest discriminated union throws on invalid type", () => {
  const manifest = {
    type: "InvalidType" as "App" | "EmbeddedCore" | "Full",
    source: [
      {
        filename: "test.bin",
        url: "https://example.com/test.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
    "Invalid discriminator value. Expected 'EmbeddedCore' | 'App' | 'Full'",
  );
});

Deno.test("Manifest discriminated union throws on missing type", () => {
  const manifest = {
    source: [
      {
        filename: "test.bin",
        url: "https://example.com/test.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
    },
  };
  assertThrows(
    () => Manifest.parse(manifest),
    z.ZodError,
  );
});

// WoT Metadata Tests
Deno.test("WoT metadata accepts placeholderExtra", () => {
  const manifest: AppManifest = {
    type: "App",
    source: [
      {
        filename: "test.bin",
        url: "https://example.com/test.bin",
        sha256:
          "708d6f0d7890c49d4345d073285f4e18ea8ecc7c5fcbc44d3c3e329dbddc17e5",
        contentType: "json",
      },
    ],
    wot: {
      tm: "https://example.com/tm.jsonld",
      placeholderExtra: {
        customField: "value",
        nested: { data: 123 },
      },
    },
  };
  const parsed = Manifest.parse(manifest);
  assertEquals(parsed, manifest);
});

