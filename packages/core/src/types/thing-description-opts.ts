import type { ThingDescription } from "npm:wot-thing-description-types";
import type { ExposedThingInit } from "npm:wot-typescript-definitions";

// TODO: make into zod schema?
export interface CityLinkTemplateMap {
  CITYLINK_ID: string;
  CITYLINK_HREF: string;

  CITYLINK_PROPERTY: string;
  CITYLINK_EVENT: string;
  CITYLINK_ACTION: string;

  CITYLINK_CORE_PROPERTY: string;
  CITYLINK_CORE_EVENT: string;
  CITYLINK_CORE_ACTION: string;

  CITYLINK_APP_PROPERTY: string;
  CITYLINK_APP_EVENT: string;
  CITYLINK_APP_ACTION: string;

  [key: string]: unknown;
}

export interface ThingDescriptionOpts<
  tmap extends CityLinkTemplateMap,
> {
  uuid: string;
  templateMap: tmap;
  selfComposition?: boolean;
  thingDescriptionTransform?: (
    partialTD: ExposedThingInit,
  ) => Promise<ThingDescription>;
}
