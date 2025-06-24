import { CacheService } from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import { errorResponse } from "../utils/error-response.ts";

const logger = createLogger("TDD", "RetrieveManifest");

export async function retrieveManifest(modelTitle: string): Promise<Response> {
  modelTitle = decodeURIComponent(modelTitle);
  logger.debug({ modelTitle }, "Retrieving Manifest");
  const manifest = await CacheService.getAppManifestCache().get(
    modelTitle,
  );

  if (!manifest) {
    logger.warn({ modelTitle }, "Manifest not found");
    return errorResponse(
      `Manifest for model title ${modelTitle} not found`,
      404,
    );
  }
  logger.debug({ modelTitle }, "Retrieved Manifest");
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
