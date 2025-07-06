// mqtt-#client-manager.ts
import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import { createLogger } from "common/log";
import type { Buffer } from "node:buffer";

export class MQTTClientManager {
  #client?: MqttClient;
  #logger: ReturnType<typeof createLogger>;
  #brokerURL: URL;
  #options: IClientOptions;

  constructor(
    brokerURL: URL,
    options: IClientOptions,
    loggerContext?: Record<string, unknown>,
  ) {
    this.#options = options;
    this.#brokerURL = brokerURL;
    this.#logger = createLogger(
      "uMQTT-Core-Controller",
      "MQTTClientManager",
      loggerContext,
    );
  }

  connect(
    onConnect: () => void,
    onMessage: (topic: string, msg: Buffer) => void,
  ) {
    this.#client = mqtt.connect(this.#brokerURL.toString(), this.#options);

    this.#client.on("connect", () => {
      this.#logger.info(`🔌 Connected to broker at ${this.#brokerURL}`);
      onConnect();
    });

    this.#client.on("message", onMessage);
  }

  subscribe(topic: string, qos: 0 | 1 | 2): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#client?.subscribe(topic, { qos }, (err) => {
        if (err) {
          this.#logger.error({ topic, err }, "❌ Subscription failed");
          reject(err);
        } else {
          this.#logger.info({ topic }, "📡 Subscribed to topic");
          resolve();
        }
      });
    });
  }

  publish(
    topic: string,
    payload: unknown,
    qos: 0 | 1 | 2 = 0,
    retain = false,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#client?.publish(
        topic,
        JSON.stringify(payload),
        { qos, retain },
        (err) => {
          if (err) {
            this.#logger.error({ topic, err }, "❌ Publish failed");
            reject(err);
          } else {
            this.#logger.debug({ topic }, "✅ Published message");
            resolve();
          }
        },
      );
    });
  }

  disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#client?.end(true, (err) => {
        if (err) {
          this.#logger.error({ err }, "❌ Disconnect failed");
          reject(err);
        } else {
          this.#logger.info("✅ MQTT #client disconnected");
          resolve();
        }
      });
    });
  }

  isConnected(): boolean {
    return !!this.#client?.connected;
  }

  get brokerURL(): URL {
    return this.#brokerURL;
  }
}
