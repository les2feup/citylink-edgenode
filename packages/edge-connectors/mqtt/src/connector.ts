import {
  EdgeConnector,
  EndNode,
  type ThingDescription,
  type ThingDescriptionOpts,
} from "@citylink-edgc/core";

import type { Buffer } from "node:buffer";

import { default as mqtt } from "mqtt";
import { RegistrationSchema } from "./types/zod/registration-schema.ts";
import {
  createPlaceholderMapMQTT,
  type PlaceholderMapMQTT,
} from "@citylink-edgc/placeholder";
import { ContextualLogger, log } from "@utils/log";

export type { IClientOptions } from "mqtt";

type RegistrationReply = {
  status: "success" | "error" | "ack";
  id?: string; // Optional ID for success responses
  message?: string; // Optional error message for error responses
};

export class MqttEdgeConnector extends EdgeConnector {
  private client?: mqtt.MqttClient;

  private readonly brokerUrl: URL;
  private readonly connectionOptions: mqtt.IClientOptions;

  private readonly nodesWaitingRegistration = new Set<string>();

  constructor(
    td: ThingDescription,
    brokerUrl: string,
    enableLogging: boolean = false,
    connectionOptions?: mqtt.IClientOptions,
  ) {
    super(td);

    if (enableLogging) {
      this.logger = new ContextualLogger(log.getLogger(import.meta.url), {
        EdgeConMqtt: this.uuid,
      });
    }

    if (!URL.canParse(brokerUrl)) {
      throw new Error(`Invalid broker URL: ${brokerUrl}`);
    }
    this.brokerUrl = URL.parse(brokerUrl)!;

    this.logger?.info(
      `Creating MQTT Edge Connector for broker: ${brokerUrl}`,
    );

    this.connectionOptions = {
      clientId: `citylink-edgecon-${this.uuid}`,
      clean: true,
      reconnectPeriod: 1000, // Reconnect every second if disconnected
      ...connectionOptions,
    };

    this.logger?.debug(
      `Connection options: ${JSON.stringify(this.connectionOptions)}`,
    );
  }

  override async startRegistrationListener(): Promise<void> {
    this.client = await mqtt.connectAsync(
      this.brokerUrl.toString(),
      this.connectionOptions,
    );

    return new Promise<void>((resolve, reject) => {
      const client = this.client!;

      client.on("connect", () => {
        this.logger?.info(`Connected to MQTT broker at ${this.brokerUrl}`);

        client.subscribe("citylink/+/registration", (err) => {
          if (err) {
            this.logger?.error(
              `Failed to subscribe to registration topic: ${err}`,
            );
            reject(err);
          } else {
            this.logger?.info("Subscribed to registration topic");
            resolve();
          }
        });
      });

      client.on("message", async (topic: string, message: Buffer) => {
        try {
          const [id, regMsg] = this.parseRegistrationMessage(topic, message);
          await this.handleNodeRegistration(id, regMsg);
        } catch (error) {
          if (error instanceof Error) {
            this.logger?.error(`Error processing message: ${error.message}`);
          } else {
            this.logger?.error("Unknown error:", error);
          }
        }
      });
    });
  }

  private async handleNodeRegistration(
    id: string,
    regMsg: RegistrationSchema,
  ): Promise<void> {
    if (this.nodesWaitingRegistration.has(id)) {
      this.logger?.warn(
        `Node with ID ${id} is already waiting for registration.`,
        `Skipping duplicate registration attempt.`,
      );
      return;
    }

    try {
      await this.registrationReply(id, { status: "ack" });
      this.nodesWaitingRegistration.add(id);

      if (this.controllers.has(id)) {
        this.logger?.info(
          `Node with ID ${id} is already registered with a valid controller.`,
          `Skipping registration. Replying with Registration success`,
        );

        await this.registrationReply(id, {
          status: "success",
        });

        return;
      }

      const newNode = await this.createNode(regMsg);
      await this.startNodeController(newNode);
      await this.registrationReply(id, {
        status: "success",
        id: newNode.id,
      });

      this.nodesWaitingRegistration.delete(id);
      this.logger?.info(`Node ${id} registered successfully.`);
    } catch (e) {
      this.logger?.error(`Node registration failed for ${id}:`, e);

      await this.controllers.get(id)?.stop();
      this.controllers.delete(id);
      this.nodesWaitingRegistration.delete(id);

      this.logger?.warn(
        `Node ${id} registration failed and its resources where removed.`,
      );

      await this.registrationReply(id, {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });

      this.logger?.error(
        `Registration reply sent with error status for node ${id}.`,
      );
    }
  }

  override stopRegistrationListener(): Promise<void> {
    if (!this.client) {
      this.logger?.warn("No MQTT client to disconnect.");
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.client!.end(false, (err) => {
        if (err) {
          this.logger?.error(`Failed to disconnect from MQTT broker: ${err}`);
          reject(err);
        } else {
          this.logger?.info("Disconnected from MQTT broker.");
          resolve();
        }
      });
    });
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
    this.logger?.debug(`Parsed end node ID: ${endNodeID}`);

    const parsed = RegistrationSchema.parse(JSON.parse(message.toString()));
    return [endNodeID, parsed];
  }

  private registrationReply(
    id: string,
    reply: RegistrationReply,
  ): Promise<void> {
    const topic = `citylink/${id}/registration/reply`;
    const message = JSON.stringify(reply);

    this.logger?.debug(
      `Sending registration reply for ${id} on topic ${topic}`,
    );

    return new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, message, { qos: 2, retain: false }, (err) => {
        if (err) {
          this.logger?.error(`Failed to publish registration reply: ${err}`);
          reject(err);
        } else {
          this.logger?.debug(`Registration reply sent for ${id}`);
          resolve();
        }
      });
    });
  }

  private async createNode(message: RegistrationSchema): Promise<EndNode> {
    const manifestURL = URL.parse(message.manifest);
    if (!manifestURL) {
      throw new Error("Invalid manifest URL");
    }

    const newNodeID = crypto.randomUUID();
    const templateMap = createPlaceholderMapMQTT(
      this.brokerUrl.toString(),
      newNodeID,
      message.templateMapExtra,
    );
    if (!templateMap) {
      throw new Error("Invalid template map in registration message");
    }

    const opts: ThingDescriptionOpts<PlaceholderMapMQTT> = {
      uuid: newNodeID,
      placeholderMap: templateMap,
    };

    const node = await EndNode.from(manifestURL, opts);
    return node;
  }
}
