import { fetchAppManifest } from "./services/fetch-app-manifest.ts";
import { fetchThingModel } from "./services/fetch-thing-model.ts";
import { produceTD } from "./services/produce-thing-description.ts";
import { v4 } from "jsr:@std/uuid";
import { createLogger } from "common/log";

import { AppManifest } from "./types/zod/app-manifest.ts";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type {
  CityLinkPlaceholderMap,
  ThingDescriptionOpts,
} from "./types/thing-description-opts.ts";
import type { ThingModel } from "../mod.ts";
import type { ControllerCompatibleTM } from "./types/end-node-controller.ts";
import type { SourceFile } from "./types/app-source.ts";
import {
  fetchAppSource,
  filterSourceFetchErrors,
} from "./services/fetch-app-source.ts";
import { ThingModelHelpers } from "@eclipse-thingweb/thing-model";
import { getTmTools } from "./services/thing-model-helpers.ts";

const logger = createLogger("core", "EndNode");

//TODO: fetch manifest source
export class EndNode {
  constructor(
    private readonly uuid: string,
    private readonly manifest: AppManifest,
    private readonly td: ThingDescription,
    private readonly compatible: ControllerCompatibleTM,
  ) {
    if (!v4.validate(uuid)) {
      throw new Error(`Invalid UUID: ${uuid}`);
    }
  }

  static async from<tmap extends CityLinkPlaceholderMap>(
    arg: AppManifest | URL,
    opts: ThingDescriptionOpts<tmap>,
  ): Promise<EndNode> {
    let manifest: AppManifest;

    if (arg instanceof URL) {
      logger.info(`📥 Fetching app manifest from ${arg.toString()}`);
      manifest = await fetchAppManifest(arg);
    } else {
      logger.info(`📥 Using provided app manifest`);
      const parsed = AppManifest.safeParse(arg);
      if (!parsed.success) {
        throw new Error("Invalid AppManifest: " + parsed.error.message);
      }

      manifest = parsed.data;
    }

    // Fetch the ThingModel from the manifest
    try {
      logger.info(
        `📦 Creating EndNode from Thing Model: ${manifest.wot.tm.href}`,
      );
      const tm = await fetchThingModel(manifest.wot.tm);
      const compatible = await resolveControllerCompatible(tm);
      const td = await produceTD(tm, opts);

      const uuid = td.id!.split("urn:uuid:")[1];
      return new EndNode(uuid, manifest, td, compatible);
    } catch (error) {
      throw new Error(`❌EndNode instantiation failed: ${error}`);
    }
  }

  async fetchSource(): Promise<SourceFile[]> {
    const fetchResults = await fetchAppSource(this.manifest.download);
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

  get appManifest(): Readonly<AppManifest> {
    return this.manifest;
  }

  get controllerCompatible(): Readonly<ControllerCompatibleTM> {
    return this.compatible;
  }
}

export async function resolveControllerCompatible(
  tm: ThingModel,
): Promise<ControllerCompatibleTM> {
  const embeddedCoreLink = tm.links!.find((link) =>
    (link.instanceName ?? "") === ("citylink:embeddedCore")
  );
  if (!embeddedCoreLink) {
    throw new Error("Thing Model does not have an embedded core link");
  }

  const embeddedCoreTM = await getTmTools().fetchModel(embeddedCoreLink.href!);
  if (!embeddedCoreTM) {
    throw new Error(
      `Failed to fetch embedded core Thing Model from ${embeddedCoreLink.href}`,
    );
  }

  const controllerLink = embeddedCoreTM.links!.find((link) =>
    (link.rel ?? "") === ("controlledBy")
  );
  if (!controllerLink) {
    throw new Error(
      `Embedded core Thing Model does not have a controlledBy link`,
    );
  }

  const controllerTM = await getTmTools().fetchModel(controllerLink.href!);
  if (!controllerTM) {
    throw new Error(
      `Failed to fetch controller Thing Model from ${controllerLink.href}`,
    );
  }

  const title = controllerTM.title;
  if (!title) {
    throw new Error(
      `Controller Thing Model at ${controllerLink.href} is missing a title`,
    );
  }

  const version = ThingModelHelpers.getModelVersion(controllerTM);
  if (!version) {
    throw new Error(
      `Controller Thing Model at ${controllerLink.href} is missing a version`,
    );
  }

  return { title, version };
}
