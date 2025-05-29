import type { ThingModel } from "npm:wot-thing-model-types";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type { ExposedThingInit } from "npm:wot-typescript-definitions";
import { AppManifest } from "./types/zod/app-manifest.ts";
import { fetchAppManifest } from "./services/fetch-app-manifest.ts";
import { fetchThingModel } from "./services/fetch-thing-model.ts";
import { getLogger } from "./utils/log/log.ts";
import { v4 } from "jsr:@std/uuid";
import {
  type CompositionOptions,
  ThingModelHelpers,
} from "../third-party/eclipse-thingweb/thing-model/src/tm-helpers.ts";

const tmTools = new ThingModelHelpers();
const logger = getLogger(import.meta.url);

export interface ProtocolTemplateMap {
  [key: string]: unknown;
}

export interface EndNodeOpts<
  tdmap extends ProtocolTemplateMap = ProtocolTemplateMap,
> {
  uuid?: string;
  templateMap: tdmap;
  thingDescriptionTransform?: (
    partialTD: ExposedThingInit,
  ) => Promise<ThingDescription>;
}

export class EndNode {
  constructor(
    private readonly uuid: string,
    private readonly manifest: AppManifest,
    private readonly td: ThingDescription,
  ) {
    if (!v4.validate(uuid)) {
      throw new Error(`Invalid UUID: ${uuid}`);
    }
  }

  static async from<T extends ProtocolTemplateMap>(
    manifestUrl: URL,
    opts: EndNodeOpts<T>,
  ): Promise<EndNode>;

  static async from<T extends ProtocolTemplateMap>(
    manifest: AppManifest,
    opts: EndNodeOpts<T>,
  ): Promise<EndNode>;

  static async from<T extends ProtocolTemplateMap>(
    arg: AppManifest | URL,
    opts: EndNodeOpts<T>,
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
      logger.debug(`Thing Model: ${JSON.stringify(tm, null, 2)}`);
      logger.info(`📝 Generating Thing Description for model "${tm.title}"`);
      const td = await produceTD(tm, opts);
      logger.info(
        `📝 Thing Description generated with id "${td.id}" for model "${tm.title}"`,
      );

      const uuid = opts.uuid ?? td.id!.split("urn:uuid:")[1];
      return new EndNode(uuid, manifest, td);
    } catch (error) {
      throw new Error(`❌EndNode instantiation failed: ${error}`);
    }
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
}

async function produceTD<
  T extends ProtocolTemplateMap,
>(
  model: ThingModel,
  opts: EndNodeOpts<T>,
): Promise<ThingDescription> {
  if (!model.title) {
    throw new Error("Model title is missing");
  }

  const options: CompositionOptions = {
    map: opts.templateMap,
    selfComposition: true,
  };

  const [partialTD] = await tmTools.getPartialTDs(model, options);
  const td = await opts.thingDescriptionTransform?.(partialTD) ??
    partialTD! as ThingDescription;
  td.id = `urn:uuid:${opts.uuid ?? crypto.randomUUID()}`;
  logger.info(
    `New Thing Description id "${td.id}" registered for model "${model.title}"`,
  );

  return td;
}
