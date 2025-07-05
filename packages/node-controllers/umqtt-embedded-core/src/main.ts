import type {
  ControllerCompatibleTM,
  EndNode,
  EndNodeController,
  ThingModel,
} from "@citylink-edgenode/core";
import mqtt from "mqtt";
import { ControllerFSM } from "./fsm.ts";
import { createLogger } from "common/log";

export class uMQTTCoreController implements EndNodeController {
  #fms: ControllerFSM;
  #topicPrefix: string;
  #brokerOpts: mqtt.IClientOptions;
  #logger: ReturnType<typeof createLogger>;

  constructor(
    private node: EndNode,
    private compat: ControllerCompatibleTM,
    private brokerURL: URL,
    brokerOpts?: mqtt.IClientOptions,
  ) {
    this.#topicPrefix = `citylink/${this.node.id}/`;

    //TODO: tie this to environment variable OR debug package
    this.#logger = createLogger("uMQTT-Core-Controller", "main", {
      node: this.node.id,
    });

    this.#fms = new ControllerFSM({ node: this.node.id });

    this.#brokerOpts = {
      ...brokerOpts,
      clientId: `citylink-uMQTT-Core-Controller-${this.node.id}`,
      clean: true, // Double Check
    };
  }

  stop(): void | Promise<void> {
    throw new Error("Method not implemented.");
  }
  start(): void | Promise<void> {
    throw new Error("Method not implemented.");
  }
  startAdaptation(tm: ThingModel | URL): Promise<void> {
    throw new Error("Method not implemented.");
  }
  get endNode(): Readonly<EndNode> {
    throw new Error("Method not implemented.");
  }
  get compatible(): Readonly<ControllerCompatibleTM> {
    throw new Error("Method not implemented.");
  }
}

