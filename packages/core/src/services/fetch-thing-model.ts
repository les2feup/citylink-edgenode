import type { ThingModel } from "npm:wot-thing-model-types";
import type { AppManifest } from "../types/zod/app-manifest.ts";
import { getThingModelCache } from "./cache-registry.ts";
import { createLogger } from "common/log";
import { getTmTools } from "./thing-model-helpers.ts";
import { ThingModelHelpers } from "@eclipse-thingweb/thing-model";

export type TmFetchMetadata = AppManifest["wot"]["tm"];

const logger = createLogger("core", "fetch-thing-model");

//TODO: refactor this to dedup with thing-model-helpers.ts
export async function fetchThingModel(
  metadata: TmFetchMetadata,
): Promise<ThingModel> {
  const cache = getThingModelCache();
  const cachedModel = await cache.get(metadata.href);

  let fetchedModel: ThingModel | undefined;
  if (!cachedModel) {
    fetchedModel = await getTmTools().fetchModel(metadata.href);
  }

  if (!fetchedModel && !cachedModel) {
    throw new Error(`Failed to fetch Thing Model from ${metadata.href}`);
  }

  const tm = cachedModel ?? fetchedModel!;
  const version = ThingModelHelpers.getModelVersion(tm);
  if (!version || version !== metadata.version.model) {
    throw new Error(
      `Model version mismatch: expected ${metadata.version}, got ${version}`,
    );
  }

  const title = metadata.title ?? tm.title;
  if (!title) {
    throw new Error(
      `Thing Model at ${metadata.href} is missing a title`,
    );
  }

  try {
    if (!cachedModel) {
      await cache.set(metadata.href, tm);
    }
  } catch (error) {
    logger.warn(`Failed to cache Thing Model at ${metadata.href}: ${error}`);
  }

  return tm;
}
