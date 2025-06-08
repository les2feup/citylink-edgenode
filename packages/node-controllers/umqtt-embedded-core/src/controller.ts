import type { Buffer } from "node:buffer";
import type {
  ControllerCompatibleTM,
  EndNodeController,
  EndNodeControllerFactory,
  SourceFile,
  ThingDescription,
  ThingDescriptionOpts,
  ThingModel,
} from "@citylink-edgc/core";
import { EndNode } from "@citylink-edgc/core";
import { createLogger } from "common/log";
import { mqttTransforms } from "common/td-transforms";
import mqtt from "mqtt";
import { endNodeMaps, type EndNodeMapTypes } from "common/end-node-maps";
import { OTAUReport } from "./types/zod/otau-report.ts";
import type {
  DeleteActionInput,
  WriteActionInput,
} from "./types/otau-action-inputs.ts";
import { crc32 } from "node:zlib";
import { encodeContentBase64 } from "./utils/content-encoding.ts";

type MqttFormOptions = {
  href: string;
  topic: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
};

export type ControllerOpts = {
  subscribeEventQos: 0 | 1 | 2;
  observePropertyQoS: 0 | 1 | 2;
};

const CoreStatusValues = ["UNDEF", "OTAU", "APP"] as const;
type CoreStatus = (typeof CoreStatusValues)[number];

export class UMQTTCoreControllerFactory implements EndNodeControllerFactory {
  private brokerURL: URL;
  private compat: ControllerCompatibleTM;
  constructor(
    tm: ThingModel,
    _opts?: ThingDescriptionOpts,
    brokerURL?: string,
    private brokerOpts?: mqtt.IClientOptions,
  ) {
    const url = brokerURL ?? "mqtt://localhost:1883";
    if (!URL.canParse(url)) {
      throw new Error(`Invalid broker URL: ${url}`);
    }
    this.brokerURL = URL.parse(url)!;

    this.compat = {
      title: tm.title!,
      version: typeof tm.version! === "string"
        ? tm.version!
        : tm.version!.model!,
    };
  }

  get compatible(): Readonly<ControllerCompatibleTM> {
    return this.compat;
  }

  produce(node: EndNode): Promise<EndNodeController> {
    return new Promise((resolve, _reject) => {
      const controller = new UMQTTCoreController(
        node,
        this.compat,
        this.brokerURL,
        this.brokerOpts,
      );
      resolve(controller);
    });
  }
}

export class UMQTTCoreController implements EndNodeController {
  // necessaryFiles must always be present after adaptation
  private static readonly adaptationReplaceIgnore = [
    "main.py",
    "main.mpy",
    "citylink/core.py",
    "citylink/core.mpy",
    "config/config.json",
  ];
  // coreDirs are not elegible for recursive deletion
  private static readonly coreDirs = ["citylink", "citylink/ext", "config"];

  private adaptationInitPromise?: {
    resolve: () => void;
    reject: (e?: unknown) => void;
  };

  private adaptationFinishPromise?: {
    resolve: () => void;
    reject: (e?: unknown) => void;
  };

  private otauWritePromise?: {
    resolve: (val: string | PromiseLike<string>) => void;
    reject: (e?: unknown) => void;
  };

  private otauDeletePromise?: {
    resolve: (val: string[] | PromiseLike<string[]>) => void;
    reject: (e?: unknown) => void;
  };

  private client?: mqtt.MqttClient;
  private logger?: ReturnType<typeof createLogger>;
  private coreStatus: CoreStatus = "UNDEF";
  private adaptationInProgress = false;
  private adaptationReplaceSet: Set<string> = new Set();
  private topicPrefix: string;
  private brokerOpts: mqtt.IClientOptions;
  private controllerOpts: ControllerOpts; // TODO: tie this to ThingDescription
  private compat;

  // private prevNodeConfig?: EndNode;

  constructor(
    private node: EndNode,
    compatible: ControllerCompatibleTM,
    private brokerURL: URL,
    brokerOpts?: mqtt.IClientOptions,
  ) {
    this.compat = compatible;
    this.topicPrefix = `citylink/${this.node.id}/`;

    //TODO: tie this to environment variable OR debug package
    this.logger = createLogger("controller", "UMQTTCore", {
      node: this.node.id,
    });

    this.brokerOpts = {
      ...brokerOpts,
      clientId: `citylink-umqttCoreController-${this.node.id}`,
      clean: true, // Double Check
    };

    this.controllerOpts = {
      subscribeEventQos: 1,
      observePropertyQoS: 1,
    };
  }

  get compatible(): Readonly<ControllerCompatibleTM> {
    return this.compat;
  }

  get endNode(): Readonly<EndNode> {
    return this.node;
  }

  start(): void {
    this.client = mqtt.connect(
      this.brokerURL.toString(),
      this.brokerOpts,
    );

    this.client!.on("connect", () => {
      this.logger?.info(`🔌 Connected to MQTT broker at ${this.brokerURL}`);

      this.subscribeToAll(
        "property",
        this.controllerOpts.observePropertyQoS,
        "citylink:platform_",
      );

      this.subscribeToAll(
        "event",
        this.controllerOpts.subscribeEventQos,
        "citylink:platform_",
      );

      this.publishDefaultProperties();

      if (this.coreStatus === "UNDEF") {
        this.logger?.info(
          `🟡 Node is in UNDEF state. Waiting for core status update...`,
        );
      }
    });

    this.client.on("message", (topic, message) => {
      // Filter out messages that don't start with our topic prefix
      if (!topic.startsWith(this.topicPrefix)) {
        this.logger?.warn(
          { topic },
          "Ignoring message on unrelated topic",
        );
        return;
      }

      // Remove the prefix to get the affordance namespace and name
      const affordance = topic.slice(this.topicPrefix.length);
      const [affordanceType, affordanceNamespace, ...affordanceNameParts] =
        affordance.split("/");
      const affordanceName = affordanceNameParts.join("/");

      if (!["properties", "events", "actions"].includes(affordanceType)) return;
      if (!affordanceType || !affordanceNamespace || !affordanceName) return;

      // Ignore all messages that relate to the platform namespace
      if (affordanceNamespace === "platform") {
        this.logger?.debug(
          { topic, affordanceType, affordanceName },
          "Ignoring platform message",
        );
        return;
      }

      this.logger?.info(
        {
          topic,
          type: affordanceType,
          namespace: affordanceNamespace,
          affordance: affordanceName,
          message: message.toString(),
        },
        "📩 New message received",
      );

      if (affordanceNamespace === "core") {
        this.handleCoreMessage(affordanceType, affordanceName, message);
      }
    });
  }

  stop(): Promise<void> {
    if (!this.client || !this.client.connected) {
      this.logger?.warn("⚠️ MQTT client is not connected. Nothing to stop.");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.client!.end(true, (err) => {
        if (err) {
          this.logger?.error(
            { error: err },
            "❌ Failed to disconnect MQTT client",
          );
          reject(err);
        } else {
          this.logger?.info("✅ MQTT client disconnected successfully.");
          resolve();
        }
      });
    });
  }

  //TODO: handle adaptation more granularly based on the different Manifest types
  async startAdaptation(tm: ThingModel | URL): Promise<void> {
    if (
      this.adaptationInitPromise || this.adaptationFinishPromise
    ) {
      this.logger?.warn(
        "⚠️ Adaptation already in progress. Cannot start a new one.",
      );
      return Promise.reject(new Error("In progress"));
    }

    //NOTE: merging "placeholder" field from the manifest
    //into the placeholderMap is handled in EndNode.from()
    const placeholderMap = endNodeMaps.mqtt.create(
      this.brokerURL.toString(),
      this.node.id,
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

    // this.prevNodeConfig = this.node; // TODO: save previous config to attempt rollback if needed
    this.node = await EndNode.from(tm, opts);

    return new Promise((resolve, reject) => {
      this.logger?.info("🔄 Starting adaptation procedure...");
      this.adaptationInitPromise = { resolve, reject };
      this.invokeAction("citylink:embeddedCore_OTAUInit").catch((err) => {
        this.logger?.error(
          { error: err },
          "❌ Failed to invoke OTAU init action",
        );
        this.adaptationInitPromise?.reject(err);
        this.adaptationInitPromise = undefined;
      });
    });
  }

  private finishAdaptation(): Promise<void> {
    if (this.coreStatus !== "OTAU") {
      this.logger?.error(
        { coreStatus: this.coreStatus },
        "❌ Cannot finish OTAU procedure in current status",
      );
      return Promise.reject(new Error("invalid core status"));
    }

    return new Promise((resolve, reject) => {
      this.logger?.info("✅ Sending finish signal for OTAU procedure.");
      this.logger?.warn(
        "⚠️ Device will reboot and its state will be `UNDEF` until reconnection.",
      );
      this.adaptationFinishPromise = { resolve, reject };
      this.invokeAction("citylink:embeddedCore_OTAUFinish").catch((err) => {
        this.logger?.error(
          { error: err },
          "❌ Failed to invoke OTAU finish action",
        );
        this.adaptationFinishPromise?.reject(err);
        this.adaptationFinishPromise = undefined;
      });
    });
  }

  private handleCoreMessage(
    affordanceType: string,
    affordanceName: string,
    message: Buffer,
  ) {
    switch (affordanceType) {
      case "properties":
        this.handleCoreProperty(affordanceName, message);
        break;
      case "events":
        this.handleCoreEvent(affordanceName, message);
        break;
      case "actions":
        this.logger?.error(
          "⚠️ Core actions should not be subscribed by the controller",
        );
        break;
      default:
        this.logger?.warn(
          { affordanceType, affordanceName },
          "⚠️ Unknown core affordance received",
        );
    }
  }

  private handleCoreProperty(
    affordanceName: string,
    message: Buffer,
  ): void {
    const value = message.toString();

    switch (affordanceName) {
      case "status": {
        this.logger?.info(`Core status update: ${JSON.stringify(value)}`);
        if (!CoreStatusValues.includes(value as CoreStatus)) {
          this.logger?.error(
            { value, expected: CoreStatusValues },
            "❌ Invalid core status value",
          );
          return;
        }
        this.handleCoreStatus(value as CoreStatus);
      }
    }
  }

  private handleCoreStatus(value: CoreStatus) {
    this.coreStatus = value;

    switch (value) {
      case "OTAU":
        this.logger?.info(`🟡 Node entered OTAU mode.`);
        if (this.adaptationInitPromise) {
          this.adaptationInitPromise?.resolve();
          this.adaptationInitPromise = undefined;
        } else if (this.adaptationFinishPromise) {
          this.logger?.warn("Aborting current adaptation process.");
          this.adaptationFinishPromise.reject(
            new Error("❌Node rebooted into OTAU mode unexpectedly."),
          );
        }

        if (this.adaptationInProgress) {
          this.logger?.warn(
            "⚠️ Adaptation already in progress. Skipping re-initialization.",
          );
          return;
        }

        this.logger?.info("🔄 Over The Air Update procedure initialized.");
        this.adaptEndNode();
        break;

      case "APP":
        this.logger?.info(`🟢 Node entered to APP mode.`);
        this.adaptationFinishPromise?.resolve();
        this.adaptationFinishPromise = undefined;
        break;

      case "UNDEF":
        this.logger?.warn(`⚪ Node is in undefined state.`);
        break;
    }
  }

  private handleCoreEvent(affordanceName: string, message: Buffer): void {
    const value = message.toString();

    switch (affordanceName) {
      case "otau/report":
        this.logger?.info(
          { affordanceName },
          "Received OTAU report event",
        );
        this.handleOtauReport(value);
        break;
      default:
        this.logger?.warn(
          {
            affordanceName,
            value: JSON.stringify(value),
          },
          "⚠️ Unknown core event",
        );
    }
  }

  private handleOtauReport(value: string): void {
    const json = JSON.parse(value);
    const parsed = OTAUReport.safeParse(json);
    if (!parsed.success) {
      this.logger?.error(
        {
          received: JSON.stringify(value, null, 2),
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
    this.logger?.info(
      {
        timestamp: date.toISOString(),
        result: JSON.stringify(result, null, 2),
      },
      "📅 OTAU report received",
    );

    if (result.error) {
      this.otauWritePromise?.reject(new Error(result.message));
      this.otauDeletePromise?.reject(new Error(result.message));
    } else if (result.written) {
      this.otauWritePromise?.resolve(result.written);
    } else if (result.deleted) {
      this.otauDeletePromise?.resolve(result.deleted);
    } else {
      // Should never happen if Zod schema is correct
      this.logger?.error({
        timestamp: date.toISOString(),
        result: JSON.stringify(result, null, 2),
      }, "❌ Unknown OTAU report result format");
    }
  }

  private async adaptationFetchSource(): Promise<SourceFile[]> {
    this.logger?.info("📦 Downloading application source...");

    const source = await this.node.fetchSource();
    if (!source || !Array.isArray(source) || source.length === 0) {
      this.logger?.error("❌ No application source files found.");
      throw new Error("❗️Adaptation failed due to missing source files.");
    }

    this.logger?.info(
      { source: source.map((file) => file.path) },
      `📦 Downloaded ${source.length} files for adaptation.`,
    );

    return source;
  }

  private adaptEndNode() {
    if (this.coreStatus !== "OTAU") {
      this.logger?.warn(
        { coreStatus: this.coreStatus },
        `❌ Cannot start adaptation procedure in current status`,
      );
      return;
    }

    this.logger?.info("🔄 Starting adaptation procedure...");
    this.adaptationInProgress = true;

    this.adaptationFetchSource()
      .then(async (appSource) => {
        const [isvalid, errorMsg] = this.isSourceValid(appSource);
        if (!isvalid) {
          throw new Error(errorMsg!);
        }

        this.logger?.info("✅ New source files validated.");

        // Step 1: Delete files from previous adaptation (if any)
        await this.adaptationDeleteFiles(appSource);

        // Step 2: Write new files to end node
        await this.adaptationWriteFiles(appSource);

        // Step 3: Finish adaptation
        await this.finishAdaptation();
      }).catch((err) => {
        this.adaptationInProgress = false;

        this.logger?.error(
          { Error: err },
          "❗️Adaptation Failed. End node may be in an inconsistent state.",
        );
      });
  }

  private isSourceValid(source: SourceFile[]): [boolean, string | null] {
    //TODO: allow for customization of the type of adaptation
    const hasMain = source.some((file) =>
      file.path === "main.py" || file.path === "main.mpy"
    );

    if (!hasMain) {
      return [
        false,
        "❗️Application source must contain 'main.py' or 'main.mpy' file.",
      ];
    }

    return [true, null];
  }

  private async adaptationDeleteFiles(source: SourceFile[]): Promise<void> {
    this.logger?.info("🔄 Starting adaptation procedure...");
    // Step 1: Delete files from previous adaptation (if any)

    const newFilePaths = new Set(
      source.map((file) => file.path),
    );

    // Files that need to be removed are those from the adaptationReplaceSet
    // that will not be overwritten by the new src files.
    const toDelete = new Set<string>([...this.adaptationReplaceSet]).difference(
      newFilePaths,
    );
    if (toDelete.size === 0) {
      return;
    }

    this.logger?.info(
      { toDelete: Array.from(toDelete) },
      `📤 Deleting ${toDelete.size} file(s) from previous adaptation...`,
    );

    for (const path of toDelete) {
      try {
        const deletedPaths = await this.otauDelete(path, true);
        this.logger?.debug(
          { deletedPaths },
          "✅ File deleted successfully",
        );
      } catch (err) {
        this.logger?.error(
          { path, error: err },
          "❌ Deletion Failed",
        );
        throw new Error("❗️Adaptation failed due to deletion error.");
      }
    }
  }

  private async adaptationWriteFiles(source: SourceFile[]): Promise<void> {
    this.logger?.info(
      { source: source.map((file) => file.path) },
      "📥 Writting files to end node...",
    );
    for (const file of source) {
      try {
        const writtenPath = await this.otauWrite(file);

        if (writtenPath !== file.path) {
          this.logger?.warn(
            { writtenPath, expected: file.path },
            `⚠️ Written path does not match expected.`,
          );
          //TODO: handle retry or rollback logic here
          break; // Stop processing if mismatch
        }

        this.logger?.debug(`✅ File ${writtenPath} written successfully.`);

        // Add to adaptationReplaceSet for future deletions
        if (!UMQTTCoreController.adaptationReplaceIgnore.includes(file.path)) {
          this.adaptationReplaceSet.add(file.path);
        }
      } catch (err) {
        this.logger?.error(
          { file: file.path, Error: err },
          "❌ Failed to write file.",
        );
        throw new Error("❗️Adaptation failed due to write error.");
        //TODO: handle retry or rollback logic here
      }
    }
  }

  private otauWrite(file: SourceFile): Promise<string> {
    const data = encodeContentBase64(file.content);
    const hash = `0x${(crc32(data) >>> 0).toString(16)}`;

    // TODO: Maybe verify this against the TD instead
    const writeInput: WriteActionInput = {
      path: file.path,
      payload: { data, hash, algo: "crc32" },
      append: false,
    };

    return new Promise<string>((resolve, reject) => {
      this.logger?.info(
        { file: file.path, hash },
        "📤 Writing file to end node...",
      );
      this.otauWritePromise = { resolve, reject };

      this.invokeAction("citylink:embeddedCore_OTAUWrite", writeInput)
        .catch((err) => {
          this.logger?.error(`❌ Failed to write file ${file.path}:`, err);
          this.otauWritePromise?.reject(err);
          this.otauWritePromise = undefined;
        });
    });
  }

  private otauDelete(
    path: string,
    recursive: boolean = false,
  ): Promise<string[]> {
    const deleteInput: DeleteActionInput = { path, recursive };

    // Reject deletion if recursive and path is a core directory
    if (
      recursive &&
      UMQTTCoreController.coreDirs.some((dir) => path.startsWith(dir))
    ) {
      this.logger?.error(
        { path, recursive },
        "❌ Cannot delete core directory recursively.",
      );
      return Promise.reject(
        new Error(`Cannot delete core directory "${path}" recursively.`),
      );
    }

    return new Promise<string[]>((resolve, reject) => {
      const delType = recursive ? "directory" : "file";

      this.logger?.info(
        { path, recursive },
        "📤 Deleting from end node.",
      );
      this.otauDeletePromise = { resolve, reject };

      this.invokeAction("citylink:embeddedCore_OTAUDelete", deleteInput).catch(
        (err) => {
          this.logger?.error(
            { path, entryType: delType, error: err },
            "❌ Deletion failed",
          );
          this.otauDeletePromise?.reject(err);
          this.otauDeletePromise = undefined;
        },
      );
    });
  }

  private publish(value: unknown, opts: MqttFormOptions): Promise<void> {
    if (opts.href !== this.brokerURL.toString()) {
      return Promise.reject(
        new Error(`❌ Mismatched href: ${opts.href} != ${this.brokerURL}`),
      );
    }

    return new Promise((resolve, reject) => {
      this.logger?.debug(
        { topic: opts.topic, value },
        `📤 Publishing`,
      );

      this.client!.publish(opts.topic, JSON.stringify(value), {
        retain: opts.retain,
        qos: opts.qos,
      }, (err) => {
        if (err) {
          reject(err);
        } else resolve();
      });
    });
  }

  private extractMqttOptions(
    forms: ThingDescription["forms"],
    affordanceType: "property" | "event" | "action",
    expectedOp: string,
  ): MqttFormOptions | null {
    const topicKey = (() => {
      switch (affordanceType) {
        case "property":
        case "event":
          return "mqv:filter";
        case "action":
          return "mqv:topic";
      }
    })();

    if (!forms || !forms.length) return null;

    for (const form of forms) {
      const ops = Array.isArray(form.op) ? form.op : [form.op];
      if (!ops.includes(expectedOp)) continue;

      const topic = form[topicKey] as string | undefined;
      const href = form.href;
      if (!topic || !href) continue;

      return {
        href,
        topic,
        qos: form["mqv:qos"] as 0 | 1 | 2 | undefined,
        retain: form["mqv:retain"] as boolean | undefined,
      };
    }

    return null;
  }

  private publishDefaultProperties(): void {
    for (
      const [name, prop] of Object.entries(
        this.node.thingDescription.properties ?? {},
      )
    ) {
      const val = prop.const ?? prop.default ?? null;
      if (val === null) continue;

      const opts = this.extractMqttOptions(
        prop.forms,
        "property",
        "readproperty",
      );
      if (opts) {
        this.publish(val, opts).catch((err) => {
          this.logger?.error(
            { affordance: name, error: err },
            "❌ Failed to publish default value",
          );
        });
      } else {
        this.logger?.warn(
          { property: name },
          "⚠️ No MQTT config for property",
        );
      }
    }
  }

  private subscribeToAll(
    type: "property" | "event",
    qos: 0 | 1 | 2,
    ignore_prefix?: string,
  ): void {
    // Check first top level forms for subscribeallevents or observeallproperties
    const topLevelOP = type === "property"
      ? "observeallproperties"
      : "subscribeallevents";

    const opts = this.extractMqttOptions(
      this.node.thingDescription.forms,
      type,
      topLevelOP,
    );

    if (opts) {
      this.subscribeToTopic(topLevelOP, opts.topic, qos);
      return; // If we have a top-level subscription, we don't need to iterate affordances
    } else {
      this.logger?.warn(
        `⚠️ No MQTT config for top-level ${type} subscription. trying individual affordances.`,
      );
    }

    const op = type === "property" ? "observeproperty" : "subscribeevent";
    const entries = type === "property"
      ? Object.entries(this.node.thingDescription.properties ?? {})
      : Object.entries(this.node.thingDescription.events ?? {});

    for (const [name, obj] of entries) {
      if (ignore_prefix && name.startsWith(ignore_prefix)) {
        this.logger?.debug(
          { affordance: name, type },
          "Skipping subcription due to ignore prefix",
        );
        continue;
      }

      const opts = this.extractMqttOptions(obj.forms, type, op);
      if (opts) {
        this.subscribeToTopic(name, opts.topic, qos);
      } else {
        this.logger?.warn(`⚠️ No MQTT config for ${type} "${name}"`);
      }
    }
  }

  private subscribeToTopic(name: string, topic: string, qos: 0 | 1 | 2): void {
    this.client?.subscribe(topic, { qos }, (err) => {
      if (err) {
        this.logger?.error(
          { affordance: name, topic, error: err },
          "❌ Subscription failed",
        );
      } else {
        this.logger?.info(
          { affordance: name, topic },
          `📡 New subscription`,
        );
      }
    });
  }

  private invokeAction(
    name: string,
    input?: unknown,
  ): Promise<void> {
    const action = this.node.thingDescription.actions?.[name];
    if (!action) {
      return Promise.reject(
        new Error(`❌Action "${name}" not found in Thing Description`),
      );
    }

    const opts = this.extractMqttOptions(
      action.forms,
      "action",
      "invokeaction",
    );
    if (!opts) {
      return Promise.reject(
        new Error(
          `❌ No MQTT config for action "${name}" in Thing Description.`,
        ),
      );
    }

    //TODO: validate input against action.input schema
    const actionInput = input ?? "";
    this.logger?.debug(
      { action: name, input: actionInput },
      "📤 Invoking action",
    );

    return new Promise((resolve, reject) => {
      this.publish(actionInput, opts)
        .then(() => {
          this.logger?.info(
            { action: name },
            `✅ Action invoked successfully.`,
          );
          resolve();
        })
        .catch((err) => {
          this.logger?.error(
            { action: name, error: err },
            "❌ Action invocation failed",
          );
          reject(err);
        });
    });
  }
}
