import { MqttEdgeConnector } from "@citylink-edgc/connector-mqtt";
import {
  UMQTTCoreControllerFactory,
} from "@citylink-edgc/controller-umqtt-core";
import * as citylink from "@citylink-edgc/core";
import {
  createPlaceholderMapMQTT,
  PlaceholderMapMQTT,
} from "@citylink-edgc/placeholder";
import { initLogger } from "../../utils/log/log.ts";

//TODO: Improvements:
// - Right now, there is too much repetition of brokerURL and UUIDs passed around.
// - TM instantiation is cumbersome, should be simplified.
// - TM instantiation should not be tied to PlaceholdeMapMQTT which is meant to be used primarily
//   with end node TMs, which is also not clear from the name.
// - Maybe create an overload of produceTD or another function that takes a TM and returns a TD,
//  without the need for a placeholder map, UUID, etc.
// - The edge connector constructor should take a ThingModel instead of a ThingDescription,

initLogger();

const brokerURL = "mqtt://localhost:1883";

const loadTM = async (path: string): Promise<citylink.ThingModel> => {
  const decoder = new TextDecoder("utf-8");
  const file = decoder.decode(await Deno.readFile(path));
  return JSON.parse(file) as citylink.ThingModel;
};

const edgeConTM: citylink.ThingModel = await loadTM(
  "./ThingModels/edge-connector-mqtt.tm.json",
);

const edgeConUUID = crypto.randomUUID();
const pmap = createPlaceholderMapMQTT(brokerURL, edgeConUUID);
const tdOpts: citylink.ThingDescriptionOpts<PlaceholderMapMQTT> = {
  uuid: edgeConUUID,
  placeholderMap: pmap,
  selfComposition: true,
};

const edgeConTD: citylink.ThingDescription = await citylink.produceTD(
  edgeConTM,
  tdOpts,
);

const controllerTM: citylink.ThingModel = await loadTM(
  "./ThingModels/mqtt-mpy-core-controller.tm.json",
);
const controllerUUID = crypto.randomUUID();
const conPmap = createPlaceholderMapMQTT(brokerURL, edgeConUUID);
const conTdOpts: citylink.ThingDescriptionOpts<PlaceholderMapMQTT> = {
  uuid: controllerUUID,
  placeholderMap: conPmap,
  selfComposition: true,
};

// TODO: this can be extracted from the TM
const compatible: citylink.ControllerCompatibleTM = {
  title: "MQTT MPY Core Controller",
  version: "0.1.0",
};

const controllerFactory = new UMQTTCoreControllerFactory(
  brokerURL,
  compatible,
  true,
);

const edgeConnector = new MqttEdgeConnector(edgeConTD, brokerURL, true);
edgeConnector.registerControllerFactory(
  controllerTM,
  conTdOpts,
  controllerFactory,
);

await edgeConnector.startRegistrationListener();
