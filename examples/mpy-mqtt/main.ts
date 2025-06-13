import { ThingDirectory } from "@citylink-edgenode/thing-directory";
import { MqttEdgeConnector } from "@citylink-edgenode/connector-mqtt";
import {
  UMQTTCoreControllerFactory,
} from "@citylink-edgenode/controller-umqtt-core";
import * as cl from "@citylink-edgenode/core";

const loadTM = async (path: string): Promise<cl.ThingModel> => {
  const decoder = new TextDecoder("utf-8");
  const file = decoder.decode(await Deno.readFile(path));
  return JSON.parse(file) as cl.ThingModel;
};

const controllerTM: cl.ThingModel = await loadTM(
  "../../ThingModels/controllers/mqtt-mpy-core-controller.tm.json",
);
const edgeConTM: cl.ThingModel = await loadTM(
  "../../ThingModels/connectors/edge-connector-mqtt.tm.json",
);

const tdOpts: cl.ThingDescriptionOpts = {
  placeholderMap: {
    CITYLINK_ID: `urn:uuid:${crypto.randomUUID()}`,
    CITYLINK_HREF: "mqtt://localhost:1883",
  },
  selfComposition: true,
};

const edgeConTD: cl.ThingDescription = await cl.utils.produceTD(
  edgeConTM,
  tdOpts,
);

const mqttConnector = new MqttEdgeConnector(edgeConTD);
mqttConnector.registerControllerFactory(
  new UMQTTCoreControllerFactory(controllerTM),
);

await mqttConnector.startRegistrationListener();

const thingDirectory = new ThingDirectory();
thingDirectory.addEdgeConnector(mqttConnector);
thingDirectory.start();
