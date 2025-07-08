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
} from "./utils/mqtt-utils.ts";
import { assertActionInput } from "./utils/assert-action-input.ts";

import {
  controllerStateTransitions,
  type CoreStatus,
  CoreStatusValues,
} from "./types/states.ts";
import { AdaptReport } from "./types/zod/adapt-report.ts";
import { settleAllPromises } from "./utils/async-utils.ts";

export class uMQTTCoreController implements EndNodeController {
  #logger: ReturnType<typeof createLogger>;

  #fsm: ControllerFSM;
  #mqttManager: MQTTClientManager;
  #adaptationManager: AdaptationManager;

  #compatible: ControllerCompatibleTM;
  #topicPrefix: string;
  #node: EndNode;

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

    this.#fsm = new ControllerFSM(
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
      this.#fsm,
      {
        initAction: this.#adaptationInit.bind(this),
        writeAction: this.#adaptationWrite.bind(this),
        deleteAction: this.#adaptationDelete.bind(this),
        commitAction: this.#adaptationCommit.bind(this),
        rollbackAction: this.#adaptationRollback.bind(this),
      },
      { node: this.#node.id },
    );
  }

  async #adaptationInit(tmURL?: URL): Promise<void> {
    if (!tmURL) {
      throw new Error("Adaptation requires a Thing Model URL");
    }
    await this.#invokeCoreAction("adaptInit", tmURL.toString());
    this.#willRestart = true;
  }

  async #adaptationWrite(file: SourceFile): Promise<void> {
    const input = AdaptationManager.makeWriteInput(file);
    await this.#invokeCoreAction("adaptWrite", input);
  }

  async #adaptationDelete(path: string, recursive: boolean): Promise<void> {
    await this.#invokeCoreAction("adaptDelete", { path, recursive });
  }

  async #adaptationCommit(): Promise<void> {
    await this.#invokeCoreAction("adaptFinish", true); // true indicates commit
    this.#willRestart = true;
  }

  async #adaptationRollback(): Promise<void> {
    await this.#invokeCoreAction("adaptFinish", false); // false indicates rollback
    this.#willRestart = true;
  }

  // ------- Controller Interface methods --------

  start(): void | Promise<void> {
    this.#logger.info("Starting uMQTT-Core Controller...");

    const onMessage = (topic: string, message: Buffer<ArrayBufferLike>) => {
      try {
        this.#onMessage(topic, message);
      } catch (err: unknown) {
        this.#logger.error(
          { err, topic, message: message.toString() },
          "❌ Error processing MQTT message",
        );
      }
    };

    const onConnect = () => {
      try {
        this.#onConnect();
      } catch (err: unknown) {
        this.#logger.error({ err }, "❌ Error during MQTT connection setup");
      }
    };

    this.#mqttManager.connect(onConnect, onMessage);
  }

  stop(): void | Promise<void> {
    if (this.#fsm.is("Adaptation")) {
      this.#logger.warn("Stopping controller while in Adaptation state.");
    }

    this.#logger.info("Stopping uMQTT-Core Controller...");
    this.#mqttManager.disconnect();
    this.#fsm.transition("Unknown");
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
    if (!this.#fsm.is("Application")) {
      throw new Error(
        `InvalidState: Cannot start adaptation in ${this.#fsm.state} state`,
      );
    }

    this.#logger.info("Starting adaptation process...");
    this.#fsm.transition("AdaptationPrep");

    try {
      const newNode = await this.#prepareNewEndNode(tm);
      const source = await newNode.fetchSource();
      await this.#adaptationManager.adapt(source, tm);
      this.#node = newNode;
    } catch (err: unknown) {
      this.#fsm.transition("Unknown");
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

  #prepareConnectPromises(timeoutMs = 3000) {
    const subPromises = [
      ...this.#collectSubscriptionPromises("property", "observeallproperties"),
      ...this.#collectSubscriptionPromises("event", "subscribeallevents"),
    ];
    const pubPromises = this.#collectPublishPromises();

    return [
      this.#wrapPromiseTasks(
        subPromises,
        "Subscribe",
        "✅ Subscribed to all properties and events.",
        "❌ Failed to subscribe to properties/events",
        timeoutMs,
      ),
      this.#wrapPromiseTasks(
        pubPromises,
        "Publish",
        "📤 Published initial property values.",
        "❌ Failed to publish initial property values",
        timeoutMs,
      ),
    ];
  }

  #collectSubscriptionPromises(
    type: "property" | "event",
    op: string,
  ): Promise<void>[] {
    const bindings = extractMqttBindings(
      this.#node.thingDescription.forms,
      type,
      op,
    );
    if (!bindings) {
      this.#logger.error(
        "❌ No MQTT bindings found for observing all properties",
      );
      throw new Error("BindingNotFound: observeallproperties");
    }

    return [this.#mqttManager.subscribe(bindings.topic, bindings.qos ?? 0)];
  }

  #collectPublishPromises(): Promise<void>[] {
    return defaultPublishPromises(
      this.#node.thingDescription,
      this.#mqttManager.publish.bind(this.#mqttManager),
    );
  }

  #withTimeout(
    p: Promise<void>,
    timeoutMs: number,
    context: string,
  ): Promise<void> {
    return Promise.race([
      p,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout in ${context}`)), timeoutMs)
      ),
    ]);
  }

  #wrapPromiseTasks(
    promises: Promise<void>[],
    context: string,
    successMsg: string,
    errorMsg: string,
    timeoutMs: number,
  ) {
    return {
      promises: promises.map((p, i) =>
        this.#withTimeout(p, timeoutMs, `${context} [${i}]`)
      ),
      onSuccess: () => this.#logger.info(successMsg),
      onError: (err: Error) =>
        this.#logger.error({ err }, `${errorMsg}: ${err.message}`),
    };
  }

  #onMessage(topic: string, message: Buffer): void {
    const parsedTopic = parseTopic(this.#topicPrefix, topic);
    if (!parsedTopic) {
      this.#logger.warn({ topic }, "⚠️ Unsupported MQTT topic format");
      return;
    }
    const { type, namespace, name } = parsedTopic;
    this.#logger.debug(
      { topic, type, namespace, affordance: name },
      "Received MQTT message",
    );

    const handlerKey = `${type}/${namespace}`;
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
    affordance: string,
    message: Buffer<ArrayBufferLike>,
  ) {
    const msg = message.toString();
    this.#logger.debug(
      { affordance, message: msg },
      "Handling core property",
    );

    switch (affordance) {
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
      case "ADAPT":
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
      this.#fsm.transition("Restarting");
      this.#willRestart = false; // Reset the restart flag
      return;
    }

    this.#logger.error(
      "End Node status is UNDEF but no restart scheduled. End Node may be disconnected or in an invalid state.",
    );

    this.#adaptationManager.abort("End Node is in UNDEF state");
    this.#fsm.transition("Unknown");
  }

  #onCoreStatusAdapt() {
    if (!(this.#fsm.is("Restarting") || this.#fsm.is("Unknown"))) {
      this.#logger.error(
        { state: this.#fsm.state },
        "⚠️ Unexpected ADAPT status received",
      );
    }

    this.#fsm.transition("Adaptation");
    if (this.#adaptationManager.resolve("init")) {
      return;
    }

    this.#logger.warn("Spontaneous End Node adaptation detected.");
    this.#node.fetchSource().then((files) => {
      this.#adaptationManager.adapt(
        files,
        undefined, // No Thing Model URL provided, use current node's source
        true, // Force new adaptation session
        "Spontaneous adaptation detected",
      );
    }).catch((err) => {
      this.#logger.error(
        { error: err },
        "❌ Spontaneous adaptation failed",
      );
    });
  }

  #onCoreStatusApp() {
    if (!this.#fsm.is("Restarting") && !this.#fsm.is("Unknown")) {
      this.#logger.error(
        { state: this.#fsm.state },
        "⚠️ Unexpected APP status received",
      );
    }

    this.#fsm.transition("Application");
    if (!this.#adaptationManager.adaptationFinished()) {
      this.#adaptationManager.abort(
        "Adaptation session not finished but core status is APP",
      );
    }
  }

  #handleCoreEvent(affordanceName: string, message: Buffer<ArrayBufferLike>) {
    const msg = message.toString();
    switch (affordanceName) {
      case "adapt/report":
        this.#assertAdaptationState("adapt/report");
        this.#logger.info(
          { affordanceName },
          "Received ADAPT report event",
        );
        this.#handleAdaptReport(msg);
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

    if (this.#fsm.is("Adaptation")) {
      this.#logger.error(
        { affordanceName },
        `⚠️ Received application ${type} message while in Adaptation state`,
      );
      //TODO: handle this scenario instead of throwing an error
      throw new Error(
        `InvalidState: Cannot handle application ${type} in Adaptation state`,
      );
    }

    if (this.#fsm.is("Unknown") || this.#fsm.is("Restarting")) {
      this.#logger.warn(
        { affordanceName, state: this.#fsm.state },
        `Unexpected application ${type} message received`,
      );

      this.#fsm.transition("Application");
    }
  }

  #handleAdaptReport(msg: string) {
    const logProcessedTime = (
      result: AdaptReport["result"],
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
        "ADAPT report processed",
      );
    };

    try {
      const json = JSON.parse(msg);
      const parsed = AdaptReport.safeParse(json);

      if (!parsed.success) {
        this.#logger.error(
          { error: parsed.error.format() },
          "❌ Invalid ADAPT report format",
        );
        return;
      }

      const { timestamp: { epoch_year, seconds }, result } = parsed.data;
      this.#processAdaptResult(result);
      logProcessedTime(result, epoch_year, seconds);
    } catch (error) {
      this.#logger.error({ error }, "❌ Failed to parse ADAPT report");
    }
  }

  #processAdaptResult(result: AdaptReport["result"]) {
    if (result.error) {
      this.#adaptationManager.reject("write", result.message);
      this.#adaptationManager.reject("delete", result.message);
    } else if (result.written) {
      this.#adaptationManager.resolve("write", result.written);
    } else if (result.deleted) {
      this.#adaptationManager.resolve("delete", result.deleted);
    } else {
      this.#logger.error({ result }, "❌ Unknown ADAPT report result format");
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
    if (!this.#fsm.is("Adaptation")) {
      this.#logger.error(
        { operation: op, state: this.#fsm.state },
        "⚠️ Cannot perform adaptation operation outside of Adaptation state",
      );
      throw new Error(
        "InvalidState: Cannot perform adaptation operation outside of Adaptation state",
      );
    }
  }
}
