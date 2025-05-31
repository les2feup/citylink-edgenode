import type { ThingModel } from "npm:wot-thing-model-types";
import type { AppManifest } from "../types/zod/app-manifest.ts";
import { getThingModelCache } from "./cache-registry.ts";
import { log } from "@utils/log";

//HACK: this import is necessary until the eclipse-thingweb/td-tools library is version bumped
import { ThingModelHelpers } from "@eclipse-thingweb/thing-model";

const tmTools = new ThingModelHelpers();
const logger = log.getLogger(import.meta.url);

export type TmFetchMetadata = AppManifest["wot"]["tm"];

export async function fetchThingModel(
  metadata: TmFetchMetadata,
): Promise<ThingModel> {
  const cache = getThingModelCache();
  const cachedModel = await cache.get(metadata.href);

  let fetchedModel: ThingModel | undefined;
  if (!cachedModel) {
    fetchedModel = await tmTools.fetchModel(metadata.href);
  }

  if (!fetchedModel && !cachedModel) {
    throw new Error(`Failed to fetch Thing Model from ${metadata.href}`);
  }

  const tm = cachedModel ?? fetchedModel!;
  const versionError = validateModelVersion(tm, metadata.version.model);
  if (versionError) {
    throw versionError;
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

function validateModelVersion(
  model: ThingModel,
  expected: string,
): Error | null {
  const version = model.version;

  if (!version) {
    return new Error("Model version is missing");
  }

  if (typeof version === "string") {
    return version === expected ? null : new Error(
      `Model version mismatch: expected ${expected}, got ${version}`,
    );
  }

  if (typeof version === "object" && version !== null) {
    const actualVersion = (version as { model?: unknown }).model;
    if (typeof actualVersion !== "string") {
      return new Error("Model version 'model' property must be a string");
    }
    return actualVersion === expected ? null : new Error(
      `Model version mismatch: expected ${expected}, got ${actualVersion}`,
    );
  }

  return new Error(
    "Model version must be a string or an object with a 'model' string",
  );
}
