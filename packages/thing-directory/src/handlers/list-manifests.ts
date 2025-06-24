import { createLogger } from "common/log";
import type { EnrichedManifest } from "../types.ts";
import { CacheService } from "@citylink-edgenode/core";
import { handleListRequestOutput } from "../utils/pagination.ts";

const logger = createLogger("TDD", "ListManifests");

export async function listManifests(
  url: URL,
): Promise<Response> {
  logger.debug("Listing Manifests");

  const allManifestsMap = await CacheService
    .getAppManifestCache().getMap();

  const enrichedManifests: EnrichedManifest[] = Array.from(
    allManifestsMap.entries(),
  ).map(
    ([modelTitle, manifest]) => {
      const base = `${url.protocol}//${url.host}`;
      const modelUrl = new URL(
        `/thing-models/${modelTitle}`,
        base,
      );
      return {
        modelTitle,
        modelUrl,
        manifest,
      };
    },
  );

  return handleListRequestOutput(
    enrichedManifests,
    "manifests",
    url.searchParams,
  );
}
