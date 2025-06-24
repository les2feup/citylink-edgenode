import type { Manifest } from "@citylink-edgenode/core";

export type EnrichedManifest = {
  modelTitle: string;
  modelUrl: URL;
  manifest: Manifest;
};
