import { AppManifest } from "./types/zod/app-manifest.ts";
import { fetchAppManifest } from "./services/fetch-app-manifest.ts";
import { fetchThingModel } from "./services/fetch-thing-model.ts";
import { produceTD } from "./services/produce-thing-description.ts";
import { getLogger } from "@utils/log";
import { v4 } from "jsr:@std/uuid";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type {
  TemplateMap,
  ThingDescriptionOpts,
} from "./types/thing-description-opts.ts";

const logger = getLogger(import.meta.url);

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

  static async from<tmap extends TemplateMap>(
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
      logger.debug(`Thing Model: ${JSON.stringify(tm, null, 2)}`);
      const td = await produceTD(tm, opts);

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
