import { fetchAppManifest } from "./services/fetch-app-manifest.ts";
import { fetchThingModel } from "./services/fetch-thing-model.ts";
import { produceTD } from "./services/produce-thing-description.ts";
import { log } from "@utils/log";
import { v4 } from "jsr:@std/uuid";

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

const logger = log.getLogger(import.meta.url);

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
      const compatible: ControllerCompatibleTM = extractControllerCompatible(
        tm,
      );
      logger.debug(`Thing Model: ${JSON.stringify(tm, null, 2)}`);
      logger.debug(
        `Controller Compatible TM: ${JSON.stringify(compatible, null, 2)}`,
      );
      const td = await produceTD(tm, opts);

      const uuid = opts.uuid ?? td.id!.split("urn:uuid:")[1];
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

function extractControllerCompatible(tm: ThingModel): ControllerCompatibleTM {
  const compatibleRaw = tm.properties?.["citylink:embeddedCore_compatible"];
  if (!compatibleRaw) {
    throw new Error(
      `Thing Model ${tm.title} does not have compatible property`,
    );
  }

  const compatibleMeta = {
    title: compatibleRaw.properties?.modelTitle?.const,
    titleType: compatibleRaw.properties?.modelTitle?.type,
    version: compatibleRaw.properties?.modelVersion?.const,
    versionType: compatibleRaw.properties?.modelVersion?.type,
  };

  if (
    compatibleMeta.titleType !== "string" ||
    compatibleMeta.versionType !== "string"
  ) {
    throw new Error(
      `Thing Model ${tm.title} has incompatible types for compatible property: ${
        JSON.stringify(
          compatibleMeta,
        )
      }`,
    );
  }

  if (!compatibleMeta.title || !compatibleMeta.version) {
    throw new Error(
      `Thing Model ${tm.title} has invalid compatible property: ${
        JSON.stringify(compatibleMeta)
      }`,
    );
  }

  return {
    title: compatibleMeta.title as string,
    version: compatibleMeta.version as string,
  };
}

function filterAppFechErrors(
  fetchResults: import("./types/app-source.ts").AppFetchResult[],
) {
  throw new Error("Function not implemented.");
}
