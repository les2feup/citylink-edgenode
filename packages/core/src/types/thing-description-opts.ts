import type { ThingDescription } from "npm:wot-thing-description-types";
import type { ExposedThingInit } from "npm:wot-typescript-definitions";

// TODO: make into zod schema?
// TODO: These fields would benefit from better names.
export interface DefaultPlaceholderMap {
  CITYLINK_ID: string;
  CITYLINK_HREF: string;

  [key: string]: unknown;
}

export interface ThingDescriptionOpts<
  tmap extends Record<string, unknown> = Record<string, unknown>,
> {
  baseUrl?: string;
  placeholderMap: tmap;
  selfComposition?: boolean;
  thingDescriptionTransform?: (
    partialTD: ExposedThingInit,
  ) => Promise<ThingDescription>;
}
