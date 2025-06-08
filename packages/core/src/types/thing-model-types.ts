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
  rel: "tm:submodel";
  type: "application/tm+json";
  instanceName: "citylink:regListener";
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
  links: LinkElement[];
  "citylink:manifest"?: Manifest;
}

type Brand<K, T> = K & { __brand: T };

export const ThingModelTags = {
  application: "AppTM",
  platform: "PlatTM",
  embeddedCore: "EmbCTM",
  edgeConnector: "ECTM",
  registrationListener: "RegLTM",
  nodeController: "NCTM",
} as const;
export type ThingModelTags = typeof ThingModelTags;

export type PlatformTM = Brand<ThingModel, ThingModelTags["platform"]>;
export type EmbeddedCoreTM = Brand<
  ThingModel,
  ThingModelTags["embeddedCore"]
>;
export type ApplicationTM = Brand<
  ThingModel,
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
  ThingModel,
  ThingModelTags["edgeConnector"]
>;
