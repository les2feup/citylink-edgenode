import type { ThingModel as WoTTM } from "npm:wot-thing-model-types";

// Non-nullable Title & ID field
export interface ThingModel extends WoTTM {
  id: string;
  title: string;
}

export interface AppThingModel extends ThingModel {
  "@type": [
    "tm:ThingModel",
    "citylink:AppTM",
  ];
}

export interface EmbeddedCoreThingModel extends ThingModel {
  "@type": [
    "tm:ThingModel",
    "citylink:EmbCTM",
  ];
}

export interface PlatfromThingModel extends ThingModel {
  "@type": [
    "tm:ThingModel",
    "citylink:PlatTM",
  ];
}
