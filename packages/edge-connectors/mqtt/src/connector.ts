import {
  EdgeConnector,
  EndNode,
  eventBus,
  EventType,
  type ThingDescription,
  type ThingDescriptionOpts,
} from "@citylink-edgenode/core";

import type { Buffer } from "node:buffer";

import { default as mqtt } from "mqtt";
import { RegistrationSchema } from "./types/zod/registration-schema.ts";
import { endNodeMaps, type EndNodeMapTypes } from "common/end-node-maps";
import { createLogger } from "common/log";
import { mqttTransforms } from "common/td-transforms";

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
    connectionOptions?: mqtt.IClientOptions,
  ) {
    super(td);
    this.logger = createLogger("MqttEdgeConnector", "connector", {
      ConnectorID: this.uuid,
    });

    // Find the href for the registration action of the form that has the invokeaction
    // op type. Technically any op type would be fine, but this way is more correct
    const href = this.td.actions!.registration.forms.find((f) =>
      f.op &&
      ((typeof f.op === "string" && f.op === "invokeaction") ||
        (f.op instanceof Array && f.op.some((kind) => kind === "invokeaction")))
    )!.href;

    if (!URL.canParse(href)) {
      throw new Error(`Invalid broker URL: ${href}`);
    }
    this.brokerUrl = URL.parse(href)!;

    this.logger?.info(
      { BrokerURL: this.brokerUrl.toString() },
      `Creating MQTT Edge Connector`,
    );

    this.connectionOptions = {
      clientId: `citylink-edgecon-${this.uuid}`,
      clean: true,
      reconnectPeriod: 1000, // Reconnect every second if disconnected
      ...connectionOptions,
    };

    this.logger?.debug(
      { ConnectionOpts: this.connectionOptions },
    );
  }

  override startRegistrationListener(): Promise<void> {
    this.client = mqtt.connect(
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
              { Error: err },
              `Failed to subscribe to registration topic`,
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
    try {
      await this.registrationReply(id, { status: "ack" });

      if (this.controllers.has(id)) {
        this.logger?.info(
          { NodeID: id },
          "Node is already registered with a valid controller.",
          "Skipping registration. Replying with success",
        );

        await this.registrationReply(id, {
          status: "success",
        });

        return;
      }

      if (this.nodesWaitingRegistration.has(id)) {
        this.logger?.warn(
          `Node with ID ${id} is already waiting for registration.`,
          `Skipping duplicate registration attempt.`,
        );
        return;
      }

      this.nodesWaitingRegistration.add(id);

      const newNode = await this.createNode(regMsg);
      await this.startNodeController(newNode);
      await this.registrationReply(id, {
        status: "success",
        id: newNode.id,
      });

      this.nodesWaitingRegistration.delete(id);
      this.logger?.info(`Node ${id} registered successfully.`);
      eventBus.thingCreated(newNode.thingDescription.id!);
    } catch (e) {
      await this.controllers.get(id)?.stop();
      this.controllers.delete(id);
      this.nodesWaitingRegistration.delete(id);

      this.logger?.error(
        { NodeID: id, Error: e instanceof Error ? e.message : String(e) },
        "Registration failed",
      );

      await this.registrationReply(id, {
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
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
          this.logger?.error(
            { Error: err },
            `Failed to disconnect from MQTT broker`,
          );
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
    const topic = `citylink/${id}/registration/ack`;
    const message = JSON.stringify(reply);

    return new Promise<void>((resolve, reject) => {
      this.client!.publish(topic, message, { qos: 2, retain: false }, (err) => {
        if (err) {
          this.logger?.error(`Failed to publish registration reply: ${err}`);
          reject(err);
        } else {
          this.logger?.debug(
            { id, topic, reply },
            `Registration reply sent`,
          );
          resolve();
        }
      });
    });
  }

  private async createNode(message: RegistrationSchema): Promise<EndNode> {
    const tmURL = URL.parse(message.tm);
    if (!tmURL) {
      throw new Error("Invalid manifest URL");
    }

    const placeholderMap = endNodeMaps.mqtt.create(
      this.brokerUrl.toString(),
      crypto.randomUUID(),
      message.placeholder,
    );
    if (!placeholderMap) {
      throw new Error("Invalid template map in registration message");
    }

    const opts: ThingDescriptionOpts<EndNodeMapTypes["mqtt"]> = {
      placeholderMap,
      thingDescriptionTransform: (td) => {
        const t1 = mqttTransforms.fillPlatfromForms(td, placeholderMap);
        return Promise.resolve(
          mqttTransforms.createTopLevelForms(t1, placeholderMap),
        );
      },
    };

    const node = await EndNode.from(tmURL, opts);
    return node;
  }
}
