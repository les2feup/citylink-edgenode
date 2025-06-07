import { produceTD } from "./services/produce-thing-description.ts";
import { v4 } from "jsr:@std/uuid";
import { createLogger } from "common/log";

import { Manifest } from "./types/zod/manifest.ts";
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
import { fetchManifest } from "./services/fetch-manifest.ts";

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

  static async from<tmap extends CityLinkPlaceholderMap>(
    arg: ThingModel | URL,
    opts: ThingDescriptionOpts<tmap>,
  ): Promise<EndNode> {
    let tm: ThingModel;

    if (arg instanceof URL) {
      logger.info(
        { url: arg.toString() },
        "📥 Fetching ThingModel",
      );
      tm = await getTmTools().fetchModel(arg.toString());
    } else {
      logger.info("📥 Using provided ThingModel");
      logger.debug({ ThingModel: arg });
      tm = arg;
      //TODO: Validate the ThingModel here
    }

    // Fetch the ThingModel from the manifest
    try {
      logger.info(
        { title: tm.title },
        `📦 Creating EndNode from Thing Model)`,
      );

      //TODO: Refactor this logic into a type validation function
      let manifest: Manifest;
      if (tm["citylink:manifest"]) {
        logger.info(
          "📦 Parsing manifest from Thing Model",
        );
        logger.debug({ manifest: tm["citylink:manifest"] });

        manifest = Manifest.parse(tm["citylink:manifest"]);
      } else if (tm.links?.some((link) => link.rel === "citylink:manifest")) {
        logger.info(
          "📦 Fetching manifest from Thing Model links",
        );
        const manifestUrl = tm.links.find(
          (link) => link.rel === "citylink:manifest",
        )?.href;
        if (!manifestUrl || !URL.canParse(manifestUrl)) {
          throw new Error("citylink:manifest link with invalid href");
        }
        logger.info({ manifestUrl }, "📦 Fetching manifest from URL");
        manifest = await fetchManifest(URL.parse(manifestUrl)!);
      } else {
        throw new Error(
          "Thing Model does not contain a citylink:manifest field or citylink:manifest link",
        );
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
