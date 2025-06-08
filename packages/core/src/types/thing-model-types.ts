import type {
  BaseLinkElement,
  ThingModel as WoTTM,
} from "npm:wot-thing-model-types";
import type { Manifest } from "./zod/manifest.ts";

// Extends with Non-nullable href and rel
export interface LinkElement extends BaseLinkElement {
  href: string;
  rel: string;
  type: string;
}

export interface EmbeddedCoreLink extends LinkElement {
  rel: "tm:submodel";
  type: "application/tm+json";
  instanceName: "citylink:embeddedCore";
}

export interface PlatformLink extends LinkElement {
  rel: "tm:submodel";
  type: "application/tm+json";
  instanceName: "citylink:platform";
}

export interface ManifestLink extends LinkElement {
  rel: "citylink:manifest";
  type: "application/json";
}

export interface ControllerLink extends LinkElement {
  rel: "citylink:controlledBy";
  type: "application/tm+json";
}

export interface RegistrationListenerLink extends LinkElement {
  rel: "tm:submodel" | "tm:extends";
  type: "application/tm+json";
  instanceName?: "citylink:regListener";
}

export interface SupportedControllerLink extends LinkElement {
  rel: "citylink:supportedController";
  type: "application/tm+json";
}

export const TDV11ContextUri = "https://www.w3.org/2022/wot/td/v1.1";
export const TDV1ContextUri = "https://www.w3.org/2019/wot/td/v1";
export type ThingContext =
  | typeof TDV1ContextUri
  | typeof TDV11ContextUri
  | [
    (typeof TDV1ContextUri | typeof TDV11ContextUri),
    ...(string | { [k: string]: unknown })[],
  ];

export type ThingModelVersion = string | {
  model: string;
  [k: string]: unknown;
};
export type ThingModelTitle = Brand<string, "TMTitle">;

// Non-nullable Title, version and stricter context
export interface ThingModel extends WoTTM {
  "@context": ThingContext;
  title: ThingModelTitle;
  version: ThingModelVersion;
  "citylink:manifest"?: Manifest;
}

export interface LinkedThingModel extends ThingModel {
  links: LinkElement[];
}

type Brand<K, T> = K & { __brand: T };

export const ThingModelTags = {
  platform: "PlatTM",
  embeddedCore: "EmbCTM",
  application: "AppTM",

  edgeConnector: "ECTM",
  nodeController: "NCTM",
  registrationListener: "RegLTM",
} as const;
export type ThingModelTags = typeof ThingModelTags;

export type PlatformTM = Brand<ThingModel, ThingModelTags["platform"]>;
export type EmbeddedCoreTM = Brand<
  LinkedThingModel,
  ThingModelTags["embeddedCore"]
>;
export type ApplicationTM = Brand<
  LinkedThingModel,
  ThingModelTags["application"]
>;
export type RegistrationListenerTM = Brand<
  ThingModel,
  ThingModelTags["registrationListener"]
>;
export type NodeControllerTM = Brand<
  ThingModel,
  ThingModelTags["nodeController"]
>;
export type EdgeConnectorTM = Brand<
  LinkedThingModel,
  ThingModelTags["edgeConnector"]
>;
