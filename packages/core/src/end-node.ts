import { produceTD } from "./services/produce-thing-description.ts";
import { v4 } from "jsr:@std/uuid";
import { createLogger } from "common/log";

import type { Manifest } from "./types/zod/manifest.ts";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type {
  DefaultPlaceholderMap,
  ThingDescriptionOpts,
} from "./types/thing-description-opts.ts";
import type {
  ApplicationTM,
  ThingModel,
  WoTThingModel,
} from "./types/thing-model-types.ts";
import type { ControllerCompatibleTM } from "./types/end-node-controller.ts";
import type { SourceFile } from "./types/app-source.ts";
import {
  fetchAppSource,
  filterSourceFetchErrors,
} from "./services/fetch-app-source.ts";
import { ThingModelHelpers } from "@eclipse-thingweb/thing-model";
import { fetchThingModel } from "./services/wot-helpers/mod.ts";
import { fetchManifest } from "./services/fetch-manifest.ts";
import {
  isValidApplicationTM,
  isValidEmbeddedCoreTM,
  isValidNodeControllerTM,
} from "./services/wot-helpers/validators.ts";
import {
  getAffordanceCacheFactory,
  getAppManifestCache,
} from "./services/cache-registry.ts";
import type { AffordanceCache } from "./types/cache.ts";

const logger = createLogger("core", "EndNode");

export class EndNode {
  //TODO: Hide these caches from the public API
  propertyCache?: AffordanceCache;
  actionCache?: AffordanceCache;
  eventCache?: AffordanceCache;

  constructor(
    private readonly uuid: string,
    private readonly nodeManifest: Manifest,
    private readonly td: ThingDescription,
    private readonly compatible: ControllerCompatibleTM,
  ) {
    if (!v4.validate(uuid)) {
      throw new Error(`Invalid UUID: ${uuid}`);
    }
  }

  static async from<tmap extends DefaultPlaceholderMap>(
    arg: ThingModel | URL,
    opts: ThingDescriptionOpts<tmap>,
  ): Promise<EndNode> {
    let tm: ThingModel;

    if (arg instanceof URL) {
      logger.info(
        { url: arg.toString() },
        "📥 Fetching ThingModel",
      );
      tm = await fetchThingModel(arg.toString());
    } else {
      logger.info("📥 Using provided ThingModel");
      logger.debug({ ThingModel: arg });
      tm = arg;
    }

    if (!isValidApplicationTM(tm)) {
      throw new Error(
        `Provided Thing Model is not a valid application Thing Model: ${tm.title}`,
      );
    }

    logger.info(
      { title: tm.title },
      `📦 Creating EndNode from Thing Model)`,
    );

    // Fetch the ThingModel from the manifest
    try {
      let manifest = tm["citylink:manifest"];
      if (!manifest) {
        const url = tm.links.find(
          (link) => link.rel === "citylink:manifestLink",
        )!.href; // earlier type guards ensure this exists

        if (!URL.canParse(url)) {
          throw new Error("citylink:manifest link with invalid href");
        }

        logger.info({ url }, "📦 Fetching manifest");
        manifest = await fetchManifest(tm.title, URL.parse(url)!);
      } else {
        logger.info("📦 Using manifest from Thing Model");
        getAppManifestCache().set(tm.title, manifest);
      }

      const compatible = await resolveControllerCompatible(tm);
      opts.placeholderMap = {
        ...opts.placeholderMap,
        ...manifest.placeholder, // Merge any extra placeholders from the manifest
      };
      const td = await produceTD(tm, opts);
      const uuid = td.id!.split("urn:uuid:")[1];

      const node = new EndNode(uuid, manifest, td, compatible);

      const cacheFactory = getAffordanceCacheFactory();
      node.propertyCache = await cacheFactory();
      node.actionCache = await cacheFactory();
      node.eventCache = await cacheFactory();

      logger.info(
        { id: node.id, title: tm.title },
        "✅ EndNode instantiated successfully",
      );

      logger.debug({
        caches: node.propertyCache && node.actionCache && node.eventCache,
      }, "Caches initialized");

      return node;
    } catch (error) {
      throw new Error(`❌EndNode instantiation failed: ${error}`);
    }
  }

  async fetchSource(): Promise<SourceFile[]> {
    const fetchResults = await fetchAppSource(this.nodeManifest.source);
    const errors = filterSourceFetchErrors(fetchResults);
    if (errors.length > 0) {
      throw new Error(
        `Failed to fetch app source files: ${
          errors.map((e) => e.error.message).join(", ")
        }`,
      );
    }

    return fetchResults as SourceFile[];
  }

  get id(): Readonly<string> {
    return this.uuid;
  }

  get thingDescription(): Readonly<ThingDescription> {
    return this.td;
  }

  get manifest(): Readonly<Manifest> {
    return this.nodeManifest;
  }

  get controllerCompatible(): Readonly<ControllerCompatibleTM> {
    return this.compatible;
  }

  getCache(type: "property" | "action" | "event"): AffordanceCache | null {
    let cache: AffordanceCache | undefined;
    switch (type) {
      case "property":
        cache = this.propertyCache;
        break;
      case "action":
        cache = this.actionCache;
        break;
      case "event":
        cache = this.eventCache;
        break;
      default:
    }

    if (!cache) {
      logger.warn(
        { type, cache },
        `No cache available for type: ${type} or cache undefined, returning null`,
      );
      return null;
    }
    return cache;
  }

  //TODO: handle errors
  async cacheAffordance<Key extends string>(
    type: "property" | "action" | "event",
    key: Key,
    value: unknown,
  ): Promise<void> {
    const cache = this.getCache(type);
    await cache?.set(key, value);
  }

  //TODO: handle errors
  async getAffordance<Key extends string>(
    type: "property" | "action" | "event",
    key: Key,
  ): Promise<unknown | undefined> {
    const cache = this.getCache(type);
    return await cache?.get(key);
  }
}

export async function resolveControllerCompatible(
  tm: ApplicationTM,
): Promise<ControllerCompatibleTM> {
  const embeddedCoreLink = tm.links.find((link) =>
    link.instanceName === "citylink:embeddedCore"
  )!; // the link is guaranteed to exist by the type guard

  const embeddedCoreTM = await fetchThingModel(embeddedCoreLink.href);
  if (!isValidEmbeddedCoreTM(embeddedCoreTM)) {
    throw new Error(
      `Fetched Embedded Core Thing Model is invalid ${embeddedCoreLink.href}`,
    );
  }

  const controllerLink = embeddedCoreTM.links.find((link) =>
    link.rel === "citylink:controlledBy"
  )!; // the link is guaranteed to exist by the type guard

  const controllerTM = await fetchThingModel(controllerLink.href);
  if (!isValidNodeControllerTM(controllerTM)) {
    throw new Error(
      `Controller Thing Model at ${controllerLink.href} is not valid`,
    );
  }
  const title = controllerTM.title;
  const version = ThingModelHelpers.getModelVersion(
    controllerTM as WoTThingModel,
  );
  if (!version) { // This should not happen due to earlier type guards
    throw new Error(
      `Controller Thing Model at ${controllerLink.href} is missing version information`,
    );
  }

  return { title, version };
}
