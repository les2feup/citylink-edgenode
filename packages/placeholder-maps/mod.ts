import type { MqttMapType } from "./end-node-maps/mqtt.ts";

import * as mqtt from "./end-node-maps/mqtt.ts";
export const endNodeMaps = {
  mqtt,
};

export type EndNodeMapTypes = {
  mqtt: MqttMapType;
};
