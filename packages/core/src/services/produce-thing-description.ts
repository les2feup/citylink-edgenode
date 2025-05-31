import type { ThingModel } from "npm:wot-thing-model-types";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type {
  CityLinkTemplateMap,
  ThingDescriptionOpts,
} from "../types/thing-description-opts.ts";
import { log } from "@utils/log";

//HACK: this import is necessary until the eclipse-thingweb/td-tools library is version bumped
import {
  type CompositionOptions,
  ThingModelHelpers,
} from "@eclipse-thingweb/thing-model";

const tmTools = new ThingModelHelpers();
const logger = log.getLogger(import.meta.url);

export async function produceTD<tmap extends CityLinkTemplateMap>(
  model: ThingModel,
  opts: ThingDescriptionOpts<tmap>,
): Promise<ThingDescription> {
  if (!model.title) {
    throw new Error("Model title is missing");
  }

  logger.info(`📝 Generating Thing Description for model "${model.title}"`);

  const options: CompositionOptions = {
    map: opts.templateMap,
    selfComposition: opts.selfComposition ?? false,
  };

  const [partialTD] = await tmTools.getPartialTDs(model, options);
  const td = await opts.thingDescriptionTransform?.(partialTD) ??
    partialTD! as ThingDescription;
  td.id = `urn:uuid:${opts.uuid ?? crypto.randomUUID()}`;
  logger.info(
    `📝 Thing Description generated with id "${td.id}" for model "${model.title}"`,
  );

  return td;
}
