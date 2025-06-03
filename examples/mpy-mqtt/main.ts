import { MqttEdgeConnector } from "@citylink-edgc/connector-mqtt";
import {
  UMQTTCoreControllerFactory,
} from "@citylink-edgc/controller-umqtt-core";
import * as cl from "@citylink-edgc/core";
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

const loadTM = async (path: string): Promise<cl.ThingModel> => {
  const decoder = new TextDecoder("utf-8");
  const file = decoder.decode(await Deno.readFile(path));
  return JSON.parse(file) as cl.ThingModel;
};

const edgeConTM: cl.ThingModel = await loadTM(
  "./ThingModels/edge-connector-mqtt.tm.json",
);

const pmap = createPlaceholderMapMQTT(brokerURL, crypto.randomUUID());
const tdOpts: cl.ThingDescriptionOpts<PlaceholderMapMQTT> = {
  placeholderMap: pmap,
  selfComposition: true,
};

const edgeConTD: cl.ThingDescription = await cl.produceTD(
  edgeConTM,
  tdOpts,
);

const controllerTM: cl.ThingModel = await loadTM(
  "./ThingModels/mqtt-mpy-core-controller.tm.json",
);
const conPmap = createPlaceholderMapMQTT(brokerURL, crypto.randomUUID());
const conTdOpts: cl.ThingDescriptionOpts<PlaceholderMapMQTT> = {
  placeholderMap: conPmap,
  selfComposition: true,
};

// TODO: this can be extracted from the TM
const compatible: cl.ControllerCompatibleTM = {
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
