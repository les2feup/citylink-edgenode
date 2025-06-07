// Library entry point for the citylink/edge-node/core module
// setup

// Exports
export { EndNode } from "./src/end-node.ts";
export { EdgeConnector } from "./src/edge-connector.ts";

export type {
  AppContentTypes,
  Manifest,
  ManifestSourceItem,
  ManifestSourceList,
} from "./src/types/zod/manifest.ts";

export type { SourceFile } from "./src/types/app-source.ts";

export type {
  ControllerCompatibleTM,
  EndNodeController,
  EndNodeControllerFactory,
} from "./src/types/end-node-controller.ts";

import { produceTD } from "./src/services/produce-thing-description.ts";
import { fetchManifest } from "./src/services/fetch-manifest.ts";
export const utils = { produceTD, fetchManifest };

export type {
  CityLinkPlaceholderMap,
  ThingDescriptionOpts,
} from "./src/types/thing-description-opts.ts";

export type { ThingModel } from "npm:wot-thing-model-types";
export type { ThingDescription } from "npm:wot-thing-description-types";

// Cache utilities

import { InMemoryCache } from "./src/utils/in-memory-cache.ts";
import { NullCache } from "./src/utils/null-cache.ts";
import {
  configure,
  getAppManifestCache,
  getThingModelCache,
} from "./src/services/cache-registry.ts";

export const CacheService = {
  InMemoryCache,
  NullCache,

  configure,
  getAppManifestCache,
  getThingModelCache,
};

export type { AppManifestCache, ThingModelCache } from "./src/types/cache.ts";
