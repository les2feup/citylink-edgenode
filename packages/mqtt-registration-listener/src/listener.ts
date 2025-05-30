import {
  EndNode,
  type RegistrationListener,
  type ThingDescriptionOpts,
} from "@citylink-edgc/core";

import { default as mqtt } from "mqtt";
import { getLogger } from "@utils/log";
import { RegistrationSchema } from "./types/zod/registration-schema.ts";
import type { Buffer } from "node:buffer";
import {
  createTemplateMapMQTT,
  type TemplateMapMQTT,
} from "./types/zod/template-map-mqtt.ts";

export type { IClientOptions } from "mqtt";

export class MqttRegistrationListener implements RegistrationListener {
  private client?: mqtt.MqttClient;
  private logger = getLogger(import.meta.url);
  private registeredUUIDs = new Set<string>();

  constructor(
    private readonly brokerUrl: string,
    private connectionOptions?: mqtt.IClientOptions,
  ) {}

  async start(
    onNodeRegistered: (
      node: EndNode,
    ) => Promise<void>,
    onError?: (error: Error) => void,
  ): Promise<void> {
    this.client = await mqtt.connectAsync(
      this.brokerUrl,
      this.connectionOptions,
    );

    return new Promise<void>((resolve, reject) => {
      const client = this.client!;

      client.on("connect", () => {
        this.logger.info(`Connected to MQTT broker at ${this.brokerUrl}`);

        client.subscribe("citylink/+/registration", (err) => {
          if (err) {
            this.logger.error(
              `Failed to subscribe to registration topic: ${err}`,
            );
            reject(err);
          } else {
            this.logger.info("Subscribed to registration topic");
            resolve();
          }
        });
      });

      client.on("message", async (topic: string, message: Buffer) => {
        try {
          const [id, regMsg] = this.parseRegistrationMessage(topic, message);
          if (this.registeredUUIDs.has(id)) {
            this.logger.warn(
              `Node with ID ${id} is already registered, ignoring message.`,
            );
            return;
          }

          const newNode = await this.createNode(regMsg);
          await onNodeRegistered(newNode);
        } catch (error) {
          if (error instanceof Error) {
            this.logger.error(`Error processing message: ${error.message}`);
            onError?.(error);
          } else {
            this.logger.error("Unknown error:", error);
            onError?.(new Error("Unknown error"));
          }
        }
      });
    });
  }

  stop(): Promise<void> {
    if (!this.client) {
      this.logger.warn("Registration listener was not started.");
      return Promise.resolve();
    }
    throw new Error("Method not implemented.");
  }

  private parseRegistrationMessage(
    topic: string,
    message: Buffer,
  ): [string, RegistrationSchema] {
    const parts = topic.split("/");

    if (
      parts.length < 3 || parts[0] !== "citylink" || parts[2] !== "registration"
    ) {
      throw new Error("Malformed topic");
    }

    // action identifier is parts[2] onwards
    const endNodeID = parts[1];
    this.logger.debug(`Parsed end node ID: ${endNodeID}`);

    const parsed = RegistrationSchema.parse(JSON.parse(message.toString()));
    return [endNodeID, parsed];
  }

  private async createNode(message: RegistrationSchema): Promise<EndNode> {
    const manifestURL = URL.parse(message.manifest);
    if (!manifestURL) {
      throw new Error("Invalid manifest URL");
    }

    const newNodeID = crypto.randomUUID();
    const templateMap = createTemplateMapMQTT(
      this.brokerUrl,
      newNodeID,
      message.templateMapExtra,
    );
    if (!templateMap) {
      throw new Error("Invalid template map in registration message");
    }

    const opts: ThingDescriptionOpts<TemplateMapMQTT> = {
      uuid: newNodeID,
      templateMap: templateMap,
    };

    const node = await EndNode.from(manifestURL, opts);
    this.registeredUUIDs.add(newNodeID); // TODO: implement this as a cache extension
    return node;
  }
}
