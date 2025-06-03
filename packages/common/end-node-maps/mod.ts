import * as mqtt from "./mqtt.ts";
import type { MqttMapType } from "./mqtt.ts";

export const endNodeMaps = {
    mqtt,
};

export type EndNodeMapTypes = {
    mqtt: MqttMapType;
};
