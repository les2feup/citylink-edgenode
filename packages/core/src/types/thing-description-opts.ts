import type { GenericOpts } from "./generic-opts.ts";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type { ExposedThingInit } from "npm:wot-typescript-definitions";

export interface TemplateMap extends GenericOpts {}

export interface ThingDescriptionOpts<
  tmap extends TemplateMap,
> {
  uuid?: string;
  templateMap: tmap;
  selfComposition?: boolean;
  thingDescriptionTransform?: (
    partialTD: ExposedThingInit,
  ) => Promise<ThingDescription>;
}
