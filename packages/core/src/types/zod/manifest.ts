import { z } from "npm:zod";

export const AppContentTypes = z.union(
  [z.instanceof(Uint8Array), z.string(), z.record(z.any())],
);

export const ManifestDownloadItem = z.object({
  filename: z.string(),
  url: z.string().url(),
  contentType: z.enum(["json", "text", "binary"]).optional().default("binary"),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const ManifestDownloadArray = z.array(ManifestDownloadItem).refine(
  (items) => items.length > 0,
  {
    message: "At least one download item is required",
  },
);

export const ManifestWoTMetadata = z.object({
  tm: z.string().url(),
  placeholderExtra: z.record(z.any()).optional(),
});

export const AppManifest = z.object({
  type: z.literal("App"),
  coreManifest: z.string().url().optional(),
  source: ManifestDownloadArray,
  wot: ManifestWoTMetadata,
});

export const CoreManifest = z.object({
  type: z.literal("EmbeddedCore"),
  removeApp: z.boolean().optional().default(false),
  source: ManifestDownloadArray,
  wot: ManifestWoTMetadata,
});

export const FullManifest = z.object({
  type: z.literal("Full"),
  source: z.object({
    core: ManifestDownloadArray,
    app: ManifestDownloadArray,
  }),
  wot: ManifestWoTMetadata,
});

export const Manifest = z.discriminatedUnion("type", [
  CoreManifest,
  AppManifest,
  FullManifest,
]);

export type AppContentTypes = z.infer<typeof AppContentTypes>;

export type ManifestDownloadItem = z.infer<typeof ManifestDownloadItem>;
export type ManifestDownloadArray = z.infer<typeof ManifestDownloadArray>;
export type ManifestWoTMetadata = z.infer<typeof ManifestWoTMetadata>;

export type CoreManifest = z.infer<typeof CoreManifest>;
export type AppManifest = z.infer<typeof AppManifest>;
export type FullManifest = z.infer<typeof FullManifest>;

export type Manifest = z.infer<typeof Manifest>;
