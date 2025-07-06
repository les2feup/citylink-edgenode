import type {
  ControllerCompatibleTM,
  EndNode,
  EndNodeController,
  ThingModel,
} from "@citylink-edgenode/core";
import type mqtt from "mqtt";
import { ControllerFSM } from "./fsm.ts";
import { createLogger } from "common/log";
import { MQTTClientManager } from "./mqtt-client-manager.ts";
import { AdaptationManager } from "./adaptation-manager.ts";
import { extractMqttBindings } from "./utils/extract-mqtt-bindings.ts";
import type { Buffer } from "node:buffer";

function defer<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const CoreStatusValues = ["UNDEF", "OTAU", "APP"] as const;
type CoreStatus = (typeof CoreStatusValues)[number];

export class uMQTTCoreController implements EndNodeController {
  #logger: ReturnType<typeof createLogger>;

  #fms: ControllerFSM;
  #mqttManager: MQTTClientManager;
  #adaptationManager: AdaptationManager;

  #compatible: ControllerCompatibleTM;
  #topicPrefix: string;
  #node: EndNode;

  #pending: {
    adaptationInit?: ReturnType<typeof defer<void>>;
    adaptationWrite?: ReturnType<typeof defer<string>>;
    adaptationDelete?: ReturnType<typeof defer<string[]>>;
    adaptationCommit?: ReturnType<typeof defer<void>>;
    adaptationRollback?: ReturnType<typeof defer<void>>;
  } = {};

  #willRestart: boolean = false;

  constructor(
    node: EndNode,
    compatible: ControllerCompatibleTM,
    brokerURL: URL,
    brokerOpts?: mqtt.IClientOptions,
  ) {
    this.#node = node;
    this.#compatible = compatible;

    this.#topicPrefix = `citylink/${this.#node.id}/`;

    //TODO: tie this to environment variable OR debug package
    this.#logger = createLogger("uMQTT-Core-Controller", "main", {
      node: this.#node.id,
    });

    this.#fms = new ControllerFSM(
      {
        Unknown: ["Application", "Adaptation"],
        Application: ["Restarting", "Unknown"],
        Adaptation: ["Restarting", "Unknown"],
        Restarting: ["Application", "Adaptation", "Unknown"],
      },
      { node: this.#node.id },
    );

    brokerOpts = {
      ...brokerOpts,
      clientId: `citylink-uMQTT-Core-Controller-${this.#node.id}`,
      clean: true,
    };

    this.#mqttManager = new MQTTClientManager(
      brokerURL,
      brokerOpts,
      { node: this.#node.id },
    );

    this.#adaptationManager = new AdaptationManager(
      {
        adaptationInit: this.#adaptationInit.bind(this),
        adaptationWrite: this.#adaptationWrite.bind(this),
        adaptationDelete: this.#adaptationDelete.bind(this),
        adaptationCommit: this.#adaptationCommit.bind(this),
        adaptationRollback: this.#adaptationRollback.bind(this),
      },
    );
  }

  // ------- Controller Interface methods --------

  start(): void | Promise<void> {
    this.#logger.info("Starting uMQTT-Core Controller...");
    this.#mqttManager.connect(
      this.#onConnect.bind(this),
      this.#onMessage.bind(this),
    );
  }

  stop(): void | Promise<void> {
    if (this.#fms.is("Adaptation")) {
      this.#logger.warn("Stopping controller while in Adaptation state.");
    }

    this.#logger.info("Stopping uMQTT-Core Controller...");
    this.#mqttManager.disconnect();
    this.#fms.transition("Unknown");
  }

  startAdaptation(tm: ThingModel | URL): Promise<void> {
    throw new Error("Method not implemented.");
  }

  get endNode(): Readonly<EndNode> {
    return this.#node;
  }

  get compatible(): Readonly<ControllerCompatibleTM> {
    return this.#compatible;
  }

  // ------- MQTT methods --------

  #onConnect(): void {
    this.#logger.info(
      `🔌 Connected to broker at ${this.#mqttManager.brokerURL}`,
    );

    // Create subcription promises to all end node properties and events
    const subPromises = [
      ...this.#subcriptionPromises("property", "observeallproperties"),
      ...this.#subcriptionPromises("event", "subscribeallevents"),
    ];

    // Create default publish promises for properties with const/default values
    const pubPromises = this.#defaultPublishPromises();

    const makePromiseTask = (
      promises: Promise<void>[],
      successMsg: string,
      errorMsg: string,
    ) => ({
      promises,
      onSuccess: () => this.#logger.info(successMsg),
      onError: (err: Error) => this.#logger.error({ err }, errorMsg),
    });

    const allPromises = [
      makePromiseTask(
        subPromises,
        "✅ Subscribed to all properties and events.",
        "❌ Failed to subscribe to properties/events.",
      ),
      makePromiseTask(
        pubPromises,
        "📤 Published initial property values.",
        "❌ Failed to publish initial property values.",
      ),
    ];

    for (const { promises, onSuccess, onError } of allPromises) {
      this.#settleAllPromises(promises, onSuccess, onError);
    }
  }

  #onMessage(topic: string, message: Buffer): void {
    if (!topic.startsWith(this.#topicPrefix)) {
      this.#logger?.warn(
        { topic },
        "Ignoring message on unrelated topic",
      );
      return;
    }

    const affordance = topic.slice(this.#topicPrefix.length);
    const [affordanceType, affordanceNamespace, ...affordanceNameParts] =
      affordance.split("/");

    const affordanceName = affordanceNameParts.join("/");
    if (!affordanceType || !affordanceNamespace || !affordanceName) return;

    if (!["properties", "events", "actions"].includes(affordanceType)) {
      this.#logger.warn(
        { topic },
        `⚠️ Unsupported affordance type: ${affordanceType}`,
      );
      return;
    }

    this.#logger.debug(
      { topic, affordanceType, affordanceNamespace, affordanceName },
      "Received MQTT message",
    );

    switch (`${affordanceType}/${affordanceNamespace}`) {
      case "properties/core":
        this.#handleCoreProperty(
          affordanceName,
          message,
        );
        break;

      case "properties/app":
        this.#handleApplicationAffordance("property", affordanceName, message);
        break;

      case "events/core":
        this.#handleCoreEvent(
          affordanceName,
          message,
        );
        break;

      case "events/app":
        this.#handleApplicationAffordance("event", affordanceName, message);
        break;

      default:
        this.#logger.warn(
          { topic },
          `⚠️ Unsupported affordance ${affordanceType}/${affordanceNamespace}`,
        );
    }
  }

  #handleCoreProperty(
    affordanceName: string,
    message: Buffer<ArrayBufferLike>,
  ) {
    const msg = message.toString();
    this.#logger.debug(
      { affordanceName, message: msg },
      "Handling core property",
    );

    switch (affordanceName) {
      case "status": {
        this.#logger.debug({ status: msg }, "Core status update received");
        if (!CoreStatusValues.includes(msg as CoreStatus)) {
          this.#logger.error(
            { msg, expected: CoreStatusValues },
            "❌ Invalid core status value",
          );
          return;
        }
        this.#handleCoreStatus(msg as CoreStatus);
      }
    }
  }

  #handleCoreStatus(status: CoreStatus) {
    switch (status) {
      case "UNDEF": {
        this.#logger.info("Core status is to UNDEF (Undefined)");
        if (this.#willRestart) {
          this.#logger.info(
            "Core will restart, transitioning to Restarting state",
          );
          this.#fms.transition("Restarting");
          this.#willRestart = false; // Reset the restart flag
          return;
        }

        this.#logger.error(
          "Core status is UNDEF but no restart scheduled.",
        );
        this.#logger.error(
          "End Node may be disconnected or in an invalid state.",
        );

        //TODO: Handle any pending adaptation promises here
        this.#fms.transition("Unknown");
        break;
      }

      case "OTAU": { // TODO: change this to "ADAPT"
        if (!this.#fms.is("Restarting") || !this.#fms.is("Unknown")) {
          this.#logger.error(
            { state: this.#fms.state },
            "⚠️ Received OTAU status while not in Restarting or Unknown state",
          );
          throw new Error(
            `InvalidState: Cannot handle OTAU status in ${this.#fms.state} state`,
          );
        }

        this.#pending.adaptationInit?.resolve() || (
          this.#logger.warn(
            "No pending adaptationInit promise to resolve when entering OTAU state",
          )
        );

        break;
      }

      case "APP": {
        if (!this.#fms.is("Restarting") && !this.#fms.is("Unknown")) {
          this.#logger.error(
            { state: this.#fms.state },
            "⚠️ Received APP status while not in Restarting or Unknown state",
          );
          throw new Error(
            `InvalidState: Cannot handle APP status in ${this.#fms.state} state`,
          );
        }

        break;
      }
    }
  }

  #handleCoreEvent(affordanceName: string, message: Buffer<ArrayBufferLike>) {
    throw new Error("Method not implemented.");
  }

  // ------- Adaptation methods --------

  async #adaptationInit(): Promise<void> {
    this.#willRestart = true;

    throw new Error("Method not implemented.");
  }

  async #adaptationWrite(file: SourceFile): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async #adaptationDelete(path: string, recursive: boolean): Promise<string[]> {
    throw new Error("Method not implemented.");
  }

  async #adaptationCommit(): Promise<void> {
    this.#willRestart = true;
    throw new Error("Method not implemented.");
  }

  async #adaptationRollback(): Promise<void> {
    this.#willRestart = true;
    throw new Error("Method not implemented.");
  }

  // ------- Utility methods --------

  #subcriptionPromises(
    affordanceType: "property" | "event",
    op: string,
  ): Promise<void>[] {
    const subPromises: Promise<void>[] = [];

    // --- Subscribe to all observable properties ---
    const options = extractMqttBindings(
      this.#node.thingDescription.forms,
      affordanceType,
      op,
    );
    if (options) {
      subPromises.push(
        this.#mqttManager.subscribe(options.topic, options.qos ?? 0),
      );
    } else {
      this.#logger.warn(
        `⚠️ No MQTT binding options found for top level ${affordanceType} subscription.`,
      );
    }

    return subPromises;
  }

  #defaultPublishPromises() {
    const pubPromises: Promise<void>[] = [];

    // --- Publish default/const values of properties ---
    const properties = this.#node.thingDescription.properties ?? {};
    for (const [name, prop] of Object.entries(properties)) {
      const value = prop.const ?? prop.default ?? null;
      if (value === null) continue;

      const opts = extractMqttBindings(prop.forms, "property", "readproperty");
      if (opts) {
        pubPromises.push(
          this.#mqttManager.publish(
            opts.topic,
            value,
            opts.qos ?? 0,
            opts.retain ?? false,
          ),
        );
      } else {
        this.#logger.warn(
          `⚠️ No MQTT publish options found for property '${name}'.`,
        );
      }
    }

    return pubPromises;
  }

  #settleAllPromises<T>(
    promises: Promise<T>[],
    onSuccess: (results: T[]) => void,
    onError: (error: Error) => void,
  ) {
    Promise.allSettled(promises)
      .then((results) => {
        const fulfilled: T[] = [];
        const errors: unknown[] = [];

        for (const result of results) {
          if (result.status === "fulfilled") {
            fulfilled.push(result.value);
          } else {
            errors.push(result.reason);
          }
        }

        if (fulfilled.length > 0) {
          onSuccess(fulfilled);
        }

        if (errors.length > 0) {
          const message = errors
            .map((err) => (err instanceof Error ? err.message : String(err)))
            .join(", ");
          onError(new Error(message));
        }
      })
      .catch(onError);
  }

  #handleApplicationAffordance(
    type: "property" | "event",
    affordanceName: string,
    message: Buffer<ArrayBufferLike>,
  ) {
    const msg = message.toString();

    this.#logger.debug(
      { affordanceName, message: msg },
      `Handling application ${type}`,
    );

    if (this.#fms.is("Adaptation")) {
      this.#logger.error(
        { affordanceName },
        `⚠️ Received application ${type} message while in Adaptation state`,
      );
      //TODO: handle this scenario instead of throwing an error
      throw new Error(
        `InvalidState: Cannot handle application ${type} in Adaptation state`,
      );
    }

    if (this.#fms.is("Unknown") || this.#fms.is("Restarting")) {
      this.#logger.warn(
        { affordanceName, state: this.#fms.state },
        `Unexpected application ${type} message received`,
      );

      this.#fms.transition("Application");
    }

    this.#node.cacheAffordance(type, `app/${affordanceName}`, msg);
  }
}
