import { z } from "npm:zod";

export const AppContentTypes = z.union(
  [z.instanceof(Uint8Array), z.string(), z.record(z.any())],
);
export type AppContentTypes = z.infer<typeof AppContentTypes>;

export const ManifestSourceItem = z.object({
  filename: z.string(),
  url: z.string().url(),
  contentType: z.string().optional().default("application/octet-stream"), // default to a binary type
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ManifestSourceItem = z.infer<typeof ManifestSourceItem>;

export const ManifestSourceList = z.array(ManifestSourceItem).refine(
  (items) => items.length > 0,
  {
    message: "At least one download item is required",
  },
);
export type ManifestSourceList = z.infer<typeof ManifestSourceList>;

export const Manifest = z.object({
  placeholder: z.record(z.string(), z.any()).optional(),
  source: ManifestSourceList,
});
export type Manifest = z.infer<typeof Manifest>;
