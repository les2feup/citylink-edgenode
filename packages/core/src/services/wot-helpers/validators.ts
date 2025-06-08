import {
  TDV11ContextUri,
  TDV1ContextUri,
  ThingModelTags,
} from "../../types/thing-model-types.ts";

import type {
  ApplicationTM,
  ControllerLink,
  EmbeddedCoreLink,
  EmbeddedCoreTM,
  LinkElement,
  ManifestLink,
  NodeControllerTM,
  PlatformLink,
  PlatformTM,
  RegistrationListenerLink,
  RegistrationListenerTM,
  ThingContext,
  ThingModel,
  ThingModelVersion,
} from "../../types/thing-model-types.ts";

import type { ThingModel as WoTTM } from "npm:wot-thing-model-types";
import { ThingModelHelpers } from "@eclipse-thingweb/thing-model";
import { Manifest } from "../../types/zod/manifest.ts";

function XOR(
  condition1: boolean,
  condition2: boolean,
): boolean {
  return (condition1 || condition2) && !(condition1 && condition2);
}

function isValidThingContext(value: unknown): value is ThingContext {
  if (value === TDV11ContextUri || value === TDV1ContextUri) {
    return true;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return false;

    return value.every(
      (item) =>
        typeof item === "string" ||
        (typeof item === "object" && item !== null),
    ) && (
      value.includes(TDV1ContextUri) || value.includes(TDV11ContextUri)
    );
  }

  return false;
}

function isValidThingModelVersion(
  value: unknown,
): value is ThingModelVersion {
  return (
    typeof value === "string" ||
    (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      "model" in value &&
      typeof value.model === "string"
    )
  );
}

function isValidWoTThingModel(tm: unknown): tm is WoTTM {
  return ThingModelHelpers.isThingModel(tm);
}

function isValidCityLinkTMType(types: unknown, tag: string): boolean {
  return (
    Array.isArray(types) &&
    types.includes(`citylink:${tag}`)
  );
}

function isValidEmbeddedCoreLink(link: LinkElement): link is EmbeddedCoreLink {
  return (
    link.rel === "tm:submodel" &&
    link.type === "application/tm+json" &&
    link.instanceName === "citylink:embeddedCore"
  );
}

function isValidPlatformLink(link: LinkElement): link is PlatformLink {
  return (
    link.rel === "tm:submodel" &&
    link.type === "application/tm+json" &&
    link.instanceName === "citylink:platform"
  );
}

function isValidManifestLink(link: LinkElement): link is ManifestLink {
  return (
    link.rel === "citylink:manifest" &&
    (link.type === "application/json" ||
      link.type === "application/citylink.manifest+json")
  );
}

function isValidControllerLink(link: LinkElement): link is ControllerLink {
  return (
    link.rel === "citylink:controlledBy" &&
    link.type === "application/tm+json"
  );
}

function isValidRegistrationListenerLink(
  link: LinkElement,
): link is RegistrationListenerLink {
  return (
    link.rel === "tm:submodel" &&
    link.type === "application/tm+json" &&
    link.instanceName === "citylink:regListener"
  );
}

function isValidSupportedControllerLink(
  link: LinkElement,
): link is RegistrationListenerLink {
  return (
    link.rel === "citylink:supportedController" &&
    link.type === "application/tm+json"
  );
}

export function isValidThingModel(
  tm: unknown,
): tm is ThingModel {
  return (
    isValidWoTThingModel(tm) &&
    isValidThingContext(tm["@context"]) &&
    isValidThingModelVersion(tm.version) &&
    typeof tm.title === "string" &&
    tm.title.length > 0 &&
    Array.isArray(tm.links) &&
    tm.links.every(
      (link) =>
        typeof link === "object" &&
        link !== null &&
        "href" in link &&
        typeof link.href === "string" &&
        "rel" in link &&
        typeof link.rel === "string" &&
        "type" in link &&
        typeof link.type === "string",
    )
  );
}

export function isValidPlatformTM(tm: unknown): tm is PlatformTM {
  return (
    isValidThingModel(tm) &&
    isValidCityLinkTMType(tm["@type"], ThingModelTags.platform)
  );
}

export function isValidEmbeddedCoreTM(
  tm: unknown,
): tm is EmbeddedCoreTM {
  return (
    isValidThingModel(tm) &&
    isValidCityLinkTMType(tm["@type"], ThingModelTags.embeddedCore) &&
    tm.links.filter(isValidControllerLink).length === 1 && // Must have exactly one controller link
    XOR( // XOR to ensure exactly one of these is present
      tm.links.filter(isValidManifestLink).length === 1,
      Manifest.safeParse(tm["citylink:manifest"]).success,
    )
  );
}

export function isValidApplicationTM(
  tm: unknown,
): tm is ApplicationTM {
  return (
    isValidThingModel(tm) &&
    isValidCityLinkTMType(tm["@type"], ThingModelTags.application) &&
    tm.links.filter(isValidEmbeddedCoreLink).length === 1 &&
    tm.links.filter(isValidPlatformLink).length === 1 &&
    XOR( // XOR to ensure exactly one of these is present
      tm.links.filter(isValidManifestLink).length === 1,
      Manifest.safeParse(tm["citylink:manifest"]).success,
    )
  );
}

export function isValidRegistrationListenerTM(
  tm: unknown,
): tm is RegistrationListenerTM {
  return (
    isValidThingModel(tm) &&
    isValidCityLinkTMType(tm["@type"], ThingModelTags.registrationListener)
  );
}

export function isValidNodeControllerTM(
  tm: unknown,
): tm is NodeControllerTM {
  return (
    isValidThingModel(tm) &&
    isValidCityLinkTMType(tm["@type"], ThingModelTags.nodeController)
  );
}

export function isValidEdgeConnectorTM(
  tm: unknown,
): tm is NodeControllerTM {
  return (
    isValidThingModel(tm) &&
    isValidCityLinkTMType(tm["@type"], ThingModelTags.edgeConnector) &&
    tm.links.filter(isValidRegistrationListenerLink).length === 1 &&
    tm.links.some(isValidSupportedControllerLink) // Must have at least one supported controller link
  );
}
