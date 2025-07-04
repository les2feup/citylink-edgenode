import {
  TDV11ContextUri,
  TDV1ContextUri,
  ThingModelTags,
} from "../../types/thing-model-types.ts";

import type {
  ApplicationTM,
  ControllerLink,
  EdgeConnectorTM,
  EmbeddedCoreLink,
  EmbeddedCoreTM,
  LinkedThingModel,
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
import { createLogger } from "common/log";

const logger = createLogger("core", "ThingModelValidators");

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
    if (value.length === 0) {
      logger.error("Invalid @context in Thing Model: empty array");
      return false;
    }

    return value.every(
      (item) =>
        typeof item === "string" ||
        (typeof item === "object" && item !== null),
    ) && (
      value.includes(TDV1ContextUri) || value.includes(TDV11ContextUri)
    );
  }

  logger.error("Invalid @context in Thing Model");
  return false;
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isValidThingModelVersion(
  value: unknown,
): value is ThingModelVersion {
  const valid = typeof value === "string" ||
    (
      isStringRecord(value) &&
      "model" in value &&
      typeof value.model === "string"
    );

  if (!valid) {
    logger.error("Invalid Thing Model version");
  }
  return valid;
}

function isValidWoTThingModel(tm: unknown): tm is WoTTM {
  const valid = ThingModelHelpers.isThingModel(tm);
  if (!valid) {
    logger.error("Invalid WoT Thing Model", tm);
  }
  return valid;
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
    link.rel === "citylink:manifestLink" &&
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

function isValidRegListenerSubmodelLink(
  link: LinkElement,
): link is RegistrationListenerLink {
  return (
    link.type === "application/tm+json" &&
    link.rel === "tm:submodel" &&
    link.instanceName === "citylink:regListener"
  );
}

function isValidRegistrationListenerExtendsLink(
  link: LinkElement,
): link is RegistrationListenerLink {
  return (
    link.type === "application/tm+json" &&
    link.rel === "tm:extends" &&
    link.instanceName === undefined
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

export function hasValidLinks(
  tm: ThingModel,
): tm is LinkedThingModel {
  return (
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

export function isValidThingModel(
  tm: unknown,
  tag?: ThingModelTags[keyof ThingModelTags],
): tm is ThingModel {
  logger.debug("validating Thing Model");
  const valid = isValidWoTThingModel(tm) &&
      isValidThingContext(tm["@context"]) &&
      isValidThingModelVersion(tm.version) &&
      typeof tm.title === "string" &&
      tm.title.length > 0 &&
      tag !== undefined
    ? (Array.isArray(tm["@type"]) &&
      tm["@type"].includes(`citylink:${tag}`))
    : true;

  if (!valid) {
    logger.error("Invalid CityLink Thing Model", tm);
  }

  return valid;
}

export function isValidPlatformTM(tm: unknown): tm is PlatformTM {
  return (
    isValidThingModel(tm, ThingModelTags.platform)
  );
}

export function isValidEmbeddedCoreTM(
  tm: unknown,
): tm is EmbeddedCoreTM {
  return (
    isValidThingModel(tm, ThingModelTags.embeddedCore) &&
    hasValidLinks(tm) &&
    tm.links.filter(isValidControllerLink).length === 1 //&& // Must have exactly one controller link
    // TODO: Enforce this on the models
    // XOR( // XOR to ensure exactly one of these is present
    //   tm.links.filter(isValidManifestLink).length === 1,
    //   Manifest.safeParse(tm["citylink:manifest"]).success,
    // )
  );
}

export function isValidApplicationTM(
  tm: unknown,
): tm is ApplicationTM {
  return (
    isValidThingModel(tm, ThingModelTags.application) &&
    hasValidLinks(tm) &&
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
  return isValidThingModel(tm, ThingModelTags.registrationListener);
}

export function isValidNodeControllerTM(
  tm: unknown,
): tm is NodeControllerTM {
  return isValidThingModel(tm, ThingModelTags.nodeController);
}

export function isValidEdgeConnectorTM(
  tm: unknown,
): tm is EdgeConnectorTM {
  return (
    isValidThingModel(tm, ThingModelTags.edgeConnector) &&
    hasValidLinks(tm) &&
    tm.links.some(isValidSupportedControllerLink) && // Must have at least one supported controller link
    XOR(
      tm.links.filter(isValidRegListenerSubmodelLink).length === 1,
      tm.links.filter(isValidRegistrationListenerExtendsLink).length <= 1 &&
        isStringRecord(tm.actions) &&
        "registration" in tm.actions,
    )
  );
}
