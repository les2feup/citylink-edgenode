import type { ThingDescription } from "npm:wot-thing-description-types";
import type { ExposedThingInit } from "npm:wot-typescript-definitions";

export interface TemplateMap {
  [key: string]: unknown;
}

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
