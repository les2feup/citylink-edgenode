// Library entry point for the citylink/edge-node/core module
// setup

import * as log from "@utils/log";
import { loggers } from "./src/utils/log-config.ts";
log.addConfigFragment(loggers);

export * as log from "@utils/log";

// Exports
export { EndNode } from "./src/end-node.ts";
export { EdgeConnector } from "./src/edge-connector.ts";

export type {
  AppContentTypes,
  AppManifest,
} from "./src/types/zod/app-manifest.ts";

export type {
  EndNodeController,
  EndNodeControllerFactory,
} from "./src/types/end-node-controller.ts";

// WoT utilities
import { produceTD } from "./src/services/produce-thing-description.ts";
import { fetchThingModel } from "./src/services/fetch-thing-model.ts";
import { fetchAppManifest } from "./src/services/fetch-app-manifest.ts";

export const WoTService = {
  produceTD,
  fetchThingModel,
  fetchAppManifest,
};

export type { TmFetchMetadata } from "./src/services/fetch-thing-model.ts";

export type {
  CityLinkTemplateMap as TemplateMap,
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
