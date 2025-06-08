import type { ThingModel } from "../types/thing-model-types.ts";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type {
  EndNodePlaceholderMap,
  ThingDescriptionOpts,
} from "../types/thing-description-opts.ts";
import { createLogger } from "common/log";

//HACK: this import is necessary until the eclipse-thingweb/td-tools library is version bumped
import type { CompositionOptions } from "@eclipse-thingweb/thing-model";
import { producePartialTDs } from "./wot-helpers/mod.ts";

export async function produceEndNodeTD<tmap extends EndNodePlaceholderMap>(
  model: ThingModel,
  opts: ThingDescriptionOpts<tmap>,
): Promise<ThingDescription> {
  const logger = createLogger("core", "produceTD");
  if (!model.title) {
    throw new Error("Model title is missing");
  }

  logger.info(`📝 Generating Thing Description for model "${model.title}"`);

  const options: CompositionOptions = {
    baseUrl: opts.baseUrl,
    map: opts.placeholderMap,
    selfComposition: true,
    //TODO: this whole functions needs to be refactored to support correctly support TMs without self-composition
    //      In fact, what we need is a way to generate partial TDs from TMs without self-compositon and then
    //      composed them afterwards if desired. This would allow for pre-processing before the final TD generation.
    //      It would also allow to cache partial TDs maybe.
  };

  const [partialTD] = await producePartialTDs(model, options);
  const td = await opts.thingDescriptionTransform?.(partialTD) ??
    partialTD! as ThingDescription;
  td.id = `${opts.placeholderMap.CITYLINK_ID}`;
  logger.info(
    `📝 Thing Description generated with id "${td.id}" for model "${model.title}"`,
  );

  return td;
}
