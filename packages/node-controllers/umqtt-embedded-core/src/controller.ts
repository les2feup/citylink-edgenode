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

import {
  defaultPublishPromises,
  extractMqttBindings,
  parseTopic,
  subcriptionPromises,
} from "./utils/mqtt-utils.ts";
import { assertActionInput } from "./utils/assert-action-input.ts";
import { defer } from "./utils/defer.ts";

import {
  controllerStateTransitions,
  type CoreStatus,
  CoreStatusValues,
} from "./types/states.ts";
import { OTAUReport } from "./types/zod/otau-report.ts";
import { makePromiseTask, settleAllPromises } from "./utils/async-utils.ts";

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

  #prepareNewEndNode(tm: URL): Promise<EndNode> {
    const placeholderMap = endNodeMaps.mqtt.create(
      this.#mqttManager.brokerURL.toString(),
      this.#node.id,
    );

    const opts: ThingDescriptionOpts<EndNodeMapTypes["mqtt"]> = {
      placeholderMap: placeholderMap,
      // deno-lint-ignore require-await
      thingDescriptionTransform: async (td) => {
        const t1 = mqttTransforms.fillPlatfromForms(td, placeholderMap);
        return mqttTransforms.createTopLevelForms(t1, placeholderMap);
      },
    };

    return EndNode.from(tm, opts);
  }

  async adaptEndNode(tm: URL): Promise<void> {
    if (!this.#fms.is("Application")) {
      throw new Error(
        `InvalidState: Cannot start adaptation in ${this.#fms.state} state`,
      );
    }

    this.#logger.info("Starting adaptation process...");
    this.#fms.transition("AdaptationPrep");

    try {
      const newNode = await this.#prepareNewEndNode(tm);
      const source = await newNode.fetchSource();
      await this.#adaptationManager.adapt(source, tm);
      this.#node = newNode;
    } catch (err: unknown) {
      this.#fms.transition("Unknown");
      const message = err instanceof Error ? err.message : String(err);
      this.#logger.error(
        { err },
        "❌ Adaptation failed, transitioning to Unknown state",
      );
      throw new Error(`Adaptation failed: ${message}`);
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
    const allPromises = this.#prepareConnectPromises();
    for (const { promises, onSuccess, onError } of allPromises) {
      settleAllPromises(promises, onSuccess, onError);
    }
  }

  #prepareConnectPromises() {
    const subPromises = [
      ["properties", "observeallproperties"],
      ["events", "observeallevents"],
    ].flatMap(
      ([type, action]) =>
        subcriptionPromises(
          this.#node.thingDescription,
          type as "property" | "event",
          action,
          this.#mqttManager.subscribe.bind(this.#mqttManager),
        ),
    );

    // Create default publish promises for properties with const/default values
    const pubPromises = defaultPublishPromises(
      this.#node.thingDescription,
      this.#mqttManager.publish.bind(this.#mqttManager),
    );

    return [
      makePromiseTask(
        subPromises,
        "✅ Subscribed to all properties and events.",
        "❌ Failed to subscribe to properties/events.",
        this.#logger,
      ),
      makePromiseTask(
        pubPromises,
        "📤 Published initial property values.",
        "❌ Failed to publish initial property values.",
        this.#logger,
      ),
    ];
  }

  #onMessage(topic: string, message: Buffer): void {
    const parsedTopic = parseTopic(this.#topicPrefix, topic);
    if (!parsedTopic) {
      this.#logger.warn({ topic }, "⚠️ Unsupported MQTT topic format");
      return;
    }
    const { type, namespace, name } = parsedTopic;
    const handlerKey = `${type}/${namespace}`;

    this.#logger.debug(
      { topic, type, namespace, name },
      "Received MQTT message",
    );

    switch (handlerKey) {
      case "properties/core":
        this.#handleCoreProperty(name, message);
        break;

      case "events/core":
        this.#handleCoreEvent(name, message);
        break;

      case "properties/app":
        this.#handleApplicationAffordance("property", name, message);
        break;

      case "events/app":
        this.#handleApplicationAffordance("event", name, message);
        break;

      default:
        this.#logger.warn(
          { topic },
          `⚠️ Unsupported affordance: ${handlerKey}`,
        );
    }

    this.#node.cacheAffordance(
      type,
      `${namespace}/${name}`,
      message.toString(),
    );
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
      case "UNDEF":
        return this.#onCoreStatusUndef();
      case "OTAU":
        return this.#onCoreStatusAdapt();
      case "APP":
        return this.#onCoreStatusApp();
      default:
        this.#logger.error({ status }, "❌ Invalid core status received");
    }
  }

  #onCoreStatusUndef() {
    this.#logger.info("Core status is UNDEF (Undefined)");
    if (this.#willRestart) {
      this.#logger.info(
        "Core will restart, transitioning to Restarting state",
      );
      this.#fms.transition("Restarting");
      this.#willRestart = false; // Reset the restart flag
      return;
    }

    this.#logger.error(
      "End Node status is UNDEF but no restart scheduled. End Node may be disconnected or in an invalid state.",
    );

    this.#rejectAllPending("End Node is in UNDEF state");
    this.#fms.transition("Unknown");
  }

  #rejectAllPending(reason: string) {
    const error = new Error(reason);
    Object.values(this.#pending).forEach((p) => p.reject(error));
    this.#pending = {};
  }

  #onCoreStatusAdapt() {
    if (!(this.#fms.is("Restarting") || this.#fms.is("Unknown"))) {
      this.#logger.error(
        { state: this.#fms.state },
        "⚠️ Unexpected OTAU status received",
      );
      return;
    }

    this.#fms.transition("Adaptation");

    if (this.#pending.adaptationInit) {
      this.#logger.info(
        "End Node ready for adaptation, resolving init promise.",
      );
      this.#pending.adaptationInit.resolve();
      delete this.#pending.adaptationInit;
    } else {
      this.#logger.warn("End Node entered Adaptation state unexpectedly.");

      this.#node.fetchSource().then((files) => {
        this.#adaptationManager.adapt(files);
      }).catch((err) => {
        this.#logger.error(
          { error: err },
          "❌ Failed to adapt End Node after spontaneous Adaptation state",
        );
      });
    }
  }

  #onCoreStatusApp() {
    if (!this.#fms.is("Restarting") && !this.#fms.is("Unknown")) {
      this.#logger.error(
        { state: this.#fms.state },
        "⚠️ Unexpected APP status received",
      );
      return;
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
    await this.#invokeCoreAction("OTAUInit", tmURL.toString());

    this.#willRestart = true;
    this.#pending.adaptationInit = defer<void>();
    return await this.#pending.adaptationInit.promise;
  }

  async #adaptationWrite(file: SourceFile): Promise<string> {
    this.#assertAdaptationState("adaptationWrite");

    const input = AdaptationManager.makeWriteInput(file);
    await this.#invokeCoreAction("OTAUWrite", input);

    this.#pending.adaptationWrite = defer<string>();
    return await this.#pending.adaptationWrite.promise;
  }

  async #adaptationDelete(path: string, recursive: boolean): Promise<string[]> {
    this.#assertAdaptationState("adaptationDelete");
    await this.#invokeCoreAction("OTAUDelete", { path, recursive });

    this.#pending.adaptationDelete = defer<string[]>();
    return await this.#pending.adaptationDelete.promise;
  }

  async #adaptationCommit(): Promise<void> {
    this.#assertAdaptationState("adaptationCommit");
    await this.#invokeCoreAction("OTAUFinish", true); // true indicates commit

    this.#willRestart = true;
    this.#pending.adaptationCommit = defer<void>();
    return await this.#pending.adaptationCommit.promise;
  }

  async #adaptationRollback(): Promise<void> {
    this.#assertAdaptationState("adaptationRollback");
    await this.#invokeCoreAction("OTAUFinish", false); // false indicates rollback

    this.#willRestart = true;
    this.#pending.adaptationRollback = defer<void>();
    return await this.#pending.adaptationRollback.promise;
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
    const logProcessedTime = (
      result: OTAUReport["result"],
      year: number,
      seconds: number,
    ) => {
      const processedAt = new Date(Date.UTC(year, 0, 1) + seconds * 1000);
      this.#logger.info(
        {
          now: new Date().toISOString(),
          processedAt: processedAt.toISOString(),
          result: JSON.stringify(result, null, 2),
        },
        "OTAU report processed",
      );
    };

    try {
      const json = JSON.parse(msg);
      const parsed = OTAUReport.safeParse(json);

      if (!parsed.success) {
        this.#logger.error(
          { error: parsed.error.format() },
          "❌ Invalid OTAU report format",
        );
        return;
      }

      const { timestamp: { epoch_year, seconds }, result } = parsed.data;
      this.#processOtauResult(result);
      logProcessedTime(result, epoch_year, seconds);
    } catch (error) {
      this.#logger.error({ error }, "❌ Failed to parse OTAU report");
    }
  }

  #processOtauResult(result: OTAUReport["result"]) {
    if (result.error) {
      const error = new Error(result.message);
      this.#pending.adaptationWrite?.reject(error);
      this.#pending.adaptationDelete?.reject(error);
    } else if (result.written) {
      this.#pending.adaptationWrite?.resolve(result.written);
    } else if (result.deleted) {
      this.#pending.adaptationDelete?.resolve(result.deleted);
    } else {
      this.#logger.error({ result }, "❌ Unknown OTAU report result format");
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

  #invokeCoreAction(name: string, input?: unknown): Promise<void> {
    return this.#invokeAction({
      name,
      input,
      prefix: "citylink:embeddedCore",
    });
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
