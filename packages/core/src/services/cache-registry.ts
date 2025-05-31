import type {
  AppContentCache,
  AppManifestCache,
  ThingModelCache,
} from "../types/cache.ts";
import type { ThingModel } from "npm:wot-thing-model-types";
import type {
  AppContentTypes,
  AppManifest,
} from "../types/zod/app-manifest.ts";
import { InMemoryCache } from "../utils/in-memory-cache.ts";

/// App Manifest Cache

let appManifestCache: AppManifestCache = new InMemoryCache<
  string,
  AppManifest
>();

export function getAppManifestCache(): Readonly<AppManifestCache> {
  return appManifestCache;
}

export function setAppManifestCache(
  cache: AppManifestCache,
): void {
  appManifestCache = cache;
}

/// Thing Model Cache

let thingModelCache: ThingModelCache = new InMemoryCache<string, ThingModel>();

export function getThingModelCache(): Readonly<ThingModelCache> {
  return thingModelCache;
}

export function setThingModelCache(
  cache: ThingModelCache,
): void {
  thingModelCache = cache;
}

let appContentCache: AppContentCache = new InMemoryCache<
  string,
  AppContentTypes
>();

export function getAppContentCache(): Readonly<AppContentCache> {
  return appContentCache;
}

export function setAppContentCache(cache: AppContentCache): void {
  appContentCache = cache;
}

/// Utility Functions

export function configure(
  appManifestCache?: AppManifestCache,
  appContentCache?: AppContentCache,
  thingModelCache?: ThingModelCache,
): void {
  if (appManifestCache) setAppManifestCache(appManifestCache);
  if (appContentCache) setAppContentCache(appContentCache);
  if (thingModelCache) setThingModelCache(thingModelCache);
}
