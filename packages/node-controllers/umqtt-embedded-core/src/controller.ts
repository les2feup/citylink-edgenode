import type {
  ControllerCompatibleTM,
  EndNodeController,
  SourceFile,
  ThingDescriptionOpts,
} from "@citylink-edgenode/core";
import { EndNode } from "@citylink-edgenode/core";

import { createLogger } from "common/log";
import { mqttTransforms } from "common/td-transforms";
import { endNodeMaps, type EndNodeMapTypes } from "common/end-node-maps";

import type mqtt from "mqtt";
import type { Buffer } from "node:buffer";

import { ControllerFSM } from "./fsm.ts";
import { MQTTClientManager } from "./mqtt-client-manager.ts";
import { AdaptationManager } from "./adaptation-manager.ts";

import { extractMqttBindings } from "./utils/extract-mqtt-bindings.ts";
import { assertActionInput } from "./utils/assert-action-input.ts";
import { defer } from "./utils/defer.ts";

import { controllerStateTransitions } from "./types/states.ts";
import { OTAUReport } from "./types/zod/otau-report.ts";

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
      controllerStateTransitions,
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

  async adaptEndNode(tm: URL): Promise<void> {
    if (!this.#fms.is("Application")) {
      this.#logger.error(
        { state: this.#fms.state },
        "❌ Cannot start adaptation in current state",
      );
      throw new Error(
        `InvalidState: Cannot start adaptation in ${this.#fms.state} state`,
      );
    }

    this.#logger.info("Starting adaptation process...");
    this.#fms.transition("AdaptationPrep");

    try {
      const placeholderMap = endNodeMaps.mqtt.create(
        this.#mqttManager.brokerURL.toString(),
        this.#node.id,
      );

      const opts: ThingDescriptionOpts<EndNodeMapTypes["mqtt"]> = {
        placeholderMap: placeholderMap,
        thingDescriptionTransform: (td) => {
          const t1 = mqttTransforms.fillPlatfromForms(td, placeholderMap);
          return Promise.resolve(
            mqttTransforms.createTopLevelForms(t1, placeholderMap),
          );
        },
      };

      const newNode = await EndNode.from(tm, opts);
      const source = await newNode.fetchSource();
      await this.#adaptationManager.adapt(source, tm);
      this.#node = newNode;
    } catch (err: unknown) {
      this.#fms.transition("Unknown");

      this.#logger.error(
        { err },
        "❌ Adaptation failed, transitioning to Unknown state",
      );
      throw new Error(
        `Adaptation failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
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
        this.#node.cacheAffordance(
          "properties",
          `app/${affordanceName}`,
          message.toString(),
        );
        break;

      case "events/core":
        this.#handleCoreEvent(
          affordanceName,
          message,
        );
        break;

      case "events/app":
        this.#handleApplicationAffordance("event", affordanceName, message);
        this.#node.cacheAffordance(
          "events",
          `app/${affordanceName}`,
          message.toString(),
        );
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
        if (!(this.#fms.is("Restarting") || this.#fms.is("Unknown"))) {
          this.#logger.error(
            { state: this.#fms.state },
            "⚠️ Unexpected OTAU status received",
          );
          throw new Error(
            `InvalidState: Cannot handle OTAU status in ${this.#fms.state} state`,
          );
        }

        this.#fms.transition("Adaptation");

        if (this.#pending.adaptationInit) {
          this.#logger.info(
            "End Node is ready for adaptation, resolving init promise.",
          );
          this.#pending.adaptationInit.resolve();
          delete this.#pending.adaptationInit;
        } else if (this.#pending.adaptationRollback) {
          this.#logger.warn(
            "End Node rebooted into Adaptation state, resolving rollback promise.",
          );
          this.#pending.adaptationRollback.resolve();
          delete this.#pending.adaptationRollback;
        } else {
          this.#logger.warn(
            "End Node rebooted into Adaptation state without pending promises.",
          );
          this.#node.fetchSource().then((files) => {
            this.#adaptationManager.adapt(files);
          }).catch((err) => {
            this.#logger.error(
              { error: err },
              "❌ Failed to adapt End Node after OTAU status",
            );
          });
        }

        break;
      }

      case "APP": {
        if (!this.#fms.is("Restarting") && !this.#fms.is("Unknown")) {
          this.#logger.error(
            { state: this.#fms.state },
            "⚠️ Unexpected APP status received",
          );
          throw new Error(
            `InvalidState: Cannot handle APP status in ${this.#fms.state} state`,
          );
        }

        this.#fms.transition("Application");
        if (this.#pending.adaptationCommit) {
          this.#logger.info(
            "End Node adaptation committed successfully, resolving commit promise.",
          );
          this.#pending.adaptationCommit.resolve();
          delete this.#pending.adaptationCommit;
        } else if (this.#pending.adaptationRollback) {
          this.#logger.info(
            "End Node rolled back adaptation, resolving rollback promise.",
          );
          this.#pending.adaptationRollback.resolve();
          delete this.#pending.adaptationRollback;
        }
        break;
      }
    }
  }

  #handleCoreEvent(affordanceName: string, message: Buffer<ArrayBufferLike>) {
    const msg = message.toString();
    switch (affordanceName) {
      case "otau/report":
        this.#assertAdaptationState("otau/report");
        this.#logger.info(
          { affordanceName },
          "Received OTAU report event",
        );
        this.#handleOtauReport(msg);
        break;
      default:
        this.#logger.warn(
          {
            affordanceName,
            value: JSON.stringify(msg),
          },
          "⚠️ Unknown core event",
        );
    }
  }

  // ------- Adaptation methods --------

  async #adaptationInit(tmURL?: URL): Promise<void> {
    if (this.#fms.is("Adaptation")) {
      this.#logger.warn(
        "Node is already in Adaptation state, skipping adaptationInit.",
      );
      return;
    }

    if (!this.#fms.is("AdaptationPrep")) {
      this.#logger.error(
        { state: this.#fms.state },
        "❌ Cannot start adaptationInit outside of AdaptationPrep state",
      );
      throw new Error(
        `InvalidState: Cannot start adaptationInit in ${this.#fms.state} state`,
      );
    }

    if (!tmURL) {
      this.#logger.error("❌ No Thing Model URL provided for adaptationInit.");
      throw new Error("InvalidArgument: tmURL is required for adaptationInit");
    }

    //TODO: Rename the OTAUInit action to something like "AdaptationInit"
    await this.#invokeAction(
      {
        name: "OTAUInit",
        input: tmURL.toString(),
        prefix: "citylink:embeddedCore",
      },
    );

    this.#willRestart = true;
    this.#pending.adaptationInit = defer<void>();
    return await this.#pending.adaptationInit.promise;
  }

  async #adaptationWrite(file: SourceFile): Promise<string> {
    this.#assertAdaptationState("adaptationWrite");

    const input = AdaptationManager.makeWriteInput(file);
    await this.#invokeAction({
      name: "OTAUWrite",
      input,
      prefix: "citylink:embeddedCore",
    });

    this.#pending.adaptationWrite = defer<string>();
    return await this.#pending.adaptationWrite.promise;
  }

  async #adaptationDelete(path: string, recursive: boolean): Promise<string[]> {
    this.#assertAdaptationState("adaptationDelete");

    await this.#invokeAction({
      name: "OTAUDelete",
      input: { path, recursive },
      prefix: "citylink:embeddedCore",
    });

    this.#pending.adaptationDelete = defer<string[]>();
    return await this.#pending.adaptationDelete.promise;
  }

  async #adaptationCommit(): Promise<void> {
    this.#assertAdaptationState("adaptationCommit");

    await this.#invokeAction({
      name: "OTAUFinish",
      input: true, // true indicates commit
      prefix: "citylink:embeddedCore",
    });

    this.#willRestart = true;
    this.#pending.adaptationCommit = defer<void>();
    return await this.#pending.adaptationCommit.promise;
  }

  async #adaptationRollback(): Promise<void> {
    this.#assertAdaptationState("adaptationRollback");

    await this.#invokeAction({
      name: "OTAUFinish",
      input: false, // false indicates rollback
      prefix: "citylink:embeddedCore",
    });

    this.#willRestart = true;
    this.#pending.adaptationRollback = defer<void>();
    return await this.#pending.adaptationRollback.promise;
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
  }

  #handleOtauReport(msg: string) {
    const json = JSON.parse(msg);
    const parsed = OTAUReport.safeParse(json);
    if (!parsed.success) {
      this.#logger.error(
        {
          received: JSON.stringify(msg, null, 2),
          error: parsed.error.format(),
        },
        "❌ Invalid OTAU report",
      );
      return;
    }

    const { timestamp, result } = parsed.data;
    const { epoch_year = 1970, seconds } = timestamp;
    const base = Date.UTC(epoch_year, 0, 1); // January 1st of the year
    const date = new Date(base + seconds * 1000);
    this.#logger.info(
      {
        timestamp: date.toISOString(),
        result: JSON.stringify(result, null, 2),
      },
      "📅 OTAU report received",
    );

    if (result.error) {
      this.#pending.adaptationWrite?.reject(new Error(result.message));
      this.#pending.adaptationDelete?.reject(new Error(result.message));
    } else if (result.written) {
      this.#pending.adaptationWrite?.resolve(result.written);
    } else if (result.deleted) {
      this.#pending.adaptationDelete?.resolve(result.deleted);
    } else {
      // Should never happen if Zod schema is correct
      this.#logger.error({
        timestamp: date.toISOString(),
        result: JSON.stringify(result, null, 2),
      }, "❌ Unknown OTAU report result format");
    }
  }

  #invokeAction({ name, input, prefix }: {
    name: string;
    input?: unknown;
    prefix?: string;
  }): Promise<void> {
    const actionPath = `${prefix ? `${prefix}_` : ""}${name}`;
    const actionElement = this.#node.thingDescription.actions?.[actionPath];
    if (!actionElement) {
      this.#logger.error(
        { actionPath },
        `❌ Action not found in Thing Description`,
      );
      throw new Error(`ActionNotFound: ${actionPath}`);
    }

    const bindings = extractMqttBindings(
      actionElement.forms,
      "action",
      "invokeaction",
    );
    if (!bindings) {
      this.#logger.error(
        { actionPath },
        `❌ No MQTT bindings found for action`,
      );
      throw new Error(`ActionBindingNotFound: ${actionPath}`);
    }

    if (actionElement.input?.const) {
      input = actionElement.input.const;
    } else {
      assertActionInput(actionElement, input);
    }

    return this.#mqttManager.publish(
      bindings.topic,
      input,
      bindings.qos,
      bindings.retain,
    );
  }

  #assertAdaptationState(op: string): void {
    if (!this.#fms.is("Adaptation")) {
      this.#logger.error(
        { operation: op, state: this.#fms.state },
        "⚠️ Cannot perform adaptation operation outside of Adaptation state",
      );
      throw new Error(
        "InvalidState: Cannot perform adaptation operation outside of Adaptation state",
      );
    }
  }
}
