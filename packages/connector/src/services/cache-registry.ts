import type { AppManifestCache, ThingModelCache } from "../types/cache.ts";
import type { ThingModel } from "npm:wot-thing-model-types";
import type { AppManifest } from "../types/zod/app-manifest.ts";
import { InMemoryCache } from "../utils/in-memory-cache.ts";

/// App Manifest Cache

let appManifestCache: AppManifestCache = new InMemoryCache<
  string,
  AppManifest
>();

export function getAppManifestCache(): AppManifestCache {
  return appManifestCache;
}

export function setAppManifestCache(
  cache: AppManifestCache,
): void {
  appManifestCache = cache;
}

/// Thing Model Cache

let thingModelCache: ThingModelCache = new InMemoryCache<string, ThingModel>();

export function getThingModelCache(): ThingModelCache {
  return thingModelCache;
}

export function setThingModelCache(
  cache: ThingModelCache,
): void {
  thingModelCache = cache;
}
