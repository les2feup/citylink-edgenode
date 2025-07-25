import type {
  AffordanceCache,
  AppContentCache,
  AppManifestCache,
  ThingModelCache,
} from "../types/cache.ts";
import type { ThingModel } from "../types/thing-model-types.ts";
import type { AppContentTypes, Manifest } from "../types/zod/manifest.ts";
import { InMemoryCache } from "../utils/in-memory-cache.ts";

/// App Manifest Cache

let appManifestCache: AppManifestCache = new InMemoryCache<
  string,
  Manifest
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

/// Node State Cache

type AffordanceCacheFactory = () => AffordanceCache | Promise<AffordanceCache>;

let affordanceCacheFactory: AffordanceCacheFactory = () =>
  new InMemoryCache<string, unknown>();

export function getAffordanceCacheFactory(): AffordanceCacheFactory {
  return affordanceCacheFactory;
}

export function setAffordanceCacheFactory(
  factory: AffordanceCacheFactory,
): void {
  affordanceCacheFactory = factory;
}

/// Utility Functions
//
export function configure(
  {
    appManifestCache,
    appContentCache,
    thingModelCache,
    nodeStateCacheFactory,
  }: {
    appManifestCache?: AppManifestCache;
    appContentCache?: AppContentCache;
    thingModelCache?: ThingModelCache;
    nodeStateCacheFactory?: AffordanceCacheFactory;
  },
): void {
  if (appManifestCache) setAppManifestCache(appManifestCache);
  if (appContentCache) setAppContentCache(appContentCache);
  if (thingModelCache) setThingModelCache(thingModelCache);
  if (nodeStateCacheFactory) setAffordanceCacheFactory(nodeStateCacheFactory);
}
