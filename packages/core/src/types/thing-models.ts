import type {
  BaseLinkElement,
  ThingModel as WoTTM,
} from "npm:wot-thing-model-types";

export type ThingContextTdUriV11 = "https://www.w3.org/2022/wot/td/v1.1";
export type ThingContextTdUriV1 = "https://www.w3.org/2019/wot/td/v1";
export type ThingContext =
  | ThingContextTdUriV1
  | ThingContextTdUriV11
  | [
    (ThingContextTdUriV1 | ThingContextTdUriV11),
    ...(string | { [k: string]: unknown })[],
  ];

// Extends with Non-nullable href and rel
export interface LinkElement extends BaseLinkElement {
  href: string;
  rel: string;
}

export interface EmbeddedCoreLink extends LinkElement {
  rel: "tm:submodel";
  href: string;
  type: "application/tm+json";
  instanceName: "citylink:embeddedCore";
}

export interface PlatformLink extends LinkElement {
  rel: "tm:submodel";
  href: string;
  type: "application/tm+json";
  instanceName: "citylink:platform";
}

export interface ManifestLink extends LinkElement {
  rel: "citylink:manifest";
  href: string;
  type: "application/json";
}

export interface ControllerLink extends LinkElement {
  rel: "citylink:controlledBy";
  href: string;
  type: "application/tm+json";
}

// Non-nullable Title, version and stricter context
export interface ThingModel extends WoTTM {
  "@context": ThingContext;
  title: string;
  version: string | { model: string; [k: string]: unknown };
  links: LinkElement[];
}

export interface AppThingModel extends ThingModel {
  "@type": [
    "tm:ThingModel",
    "citylink:AppTM",
    ...string[],
  ];

  // Must contain 1 EmbeddedCoreLink and 1 PlatformLink irrelevant of order
  // Might contain 1 ManifestLink
  // Remaining fields are optional of type LinkElement
}

export interface EmbeddedCoreThingModel extends ThingModel {
  "@type": [
    "tm:ThingModel",
    "citylink:EmbCTM",
    ...string[],
  ];

  // Must contain 1 ControllerLink
  // Might contain 1 ManifestLink
  // Remaining fields are optional of type LinkElement
}

export interface PlatformThingModel extends ThingModel {
  "@type": [
    "tm:ThingModel",
    "citylink:PlatTM",
    ...string[],
  ];
}
