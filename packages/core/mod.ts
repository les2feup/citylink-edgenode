// Library entry point for the citylink/edge-node/core module

export { EndNode } from "./src/end-node.ts";
export { EdgeConnector, EdgeConnectorFactory } from "./src/edge-connector.ts";

export type {
  AppContentTypes,
  AppManifest,
} from "./src/types/zod/app-manifest.ts";
export type { RegistrationListener } from "./src/types/registration-listener.ts";
export type {
  EndNodeController,
  EndNodeControllerFactory,
} from "./src/types/end-node-controller.ts";
export type {
  TemplateMap,
  ThingDescriptionOpts,
} from "./src/types/thing-description-opts.ts";

export type { ThingModel } from "npm:wot-thing-model-types";
export type { ThingDescription } from "npm:wot-thing-description-types";

// Exporting utility functions and classes

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
