// Library entry point for the citylink/edge-node/core module
// setup

// Exports
export { EndNode } from "./src/end-node.ts";
export { EdgeConnector } from "./src/edge-connector.ts";

export * from "./src/types/zod/manifest.ts";
export type * from "./src/types/zod/manifest.ts";

export type { SourceFile } from "./src/types/app-source.ts";

export type {
  ControllerCompatibleTM,
  EndNodeController,
  EndNodeControllerFactory,
} from "./src/types/end-node-controller.ts";

import * as wotHelpers from "./src/services/wot-helpers/mod.ts";
import { fetchManifest } from "./src/services/fetch-manifest.ts";
import { produceTD } from "./src/services/produce-thing-description.ts";
export const utils = { produceTD, fetchManifest, ...wotHelpers };
export * from "./src/types/thing-model-types.ts";

export type {
  DefaultPlaceholderMap,
  ThingDescriptionOpts,
} from "./src/types/thing-description-opts.ts";

//TODO: custom types for ThingDescription
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

export { eventBus, EventType } from "./src/events.ts";
