import { produceTD } from "./services/produce-thing-description.ts";
import { v4 } from "jsr:@std/uuid";
import { createLogger } from "common/log";

import type { Manifest } from "./types/zod/manifest.ts";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type {
  DefaultPlaceholderMap,
  ThingDescriptionOpts,
} from "./types/thing-description-opts.ts";
import type { ApplicationTM, ThingModel } from "./types/thing-model-types.ts";
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
  isValidNodeControllerTM,
} from "./services/wot-helpers/validators.ts";

const logger = createLogger("core", "EndNode");

export class EndNode {
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
          (link) => link.rel === "citylink:manifest",
        )!.href; // earlier type guards ensure this exists

        if (!URL.canParse(url)) {
          throw new Error("citylink:manifest link with invalid href");
        }

        logger.info({ url }, "📦 Fetching manifest");
        manifest = await fetchManifest(URL.parse(url)!);
      }

      const compatible = await resolveControllerCompatible(tm);
      opts.placeholderMap = {
        ...opts.placeholderMap,
        ...manifest.placeholder, // Merge any extra placeholders from the manifest
      };
      const td = await produceTD(tm, opts);
      const uuid = td.id!.split("urn:uuid:")[1];
      return new EndNode(uuid, manifest, td, compatible);
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
}

export async function resolveControllerCompatible(
  tm: ApplicationTM,
): Promise<ControllerCompatibleTM> {
  const embeddedCoreLink = tm.links.find((link) =>
    link.instanceName === "citylink:embeddedCore"
  )!; // the link is guaranteed to exist by the type guard

  const embeddedCoreTM = await fetchThingModel(embeddedCoreLink.href);
  if (!embeddedCoreTM) {
    throw new Error(
      `Failed to fetch embedded core Thing Model from ${embeddedCoreLink.href}`,
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
  const version = ThingModelHelpers.getModelVersion(controllerTM);
  if (!version) { // This should not happen due to earlier type guards
    throw new Error(
      `Controller Thing Model at ${controllerLink.href} is missing version information`,
    );
  }

  return { title, version };
}
