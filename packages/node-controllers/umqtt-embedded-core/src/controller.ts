import type { Buffer } from "node:buffer";
import type {
  AppManifest,
  ControllerCompatibleTM,
  EndNodeController,
  EndNodeControllerFactory,
  SourceFile,
  ThingDescription,
  ThingDescriptionOpts,
} from "@citylink-edgc/core";
import { EndNode } from "@citylink-edgc/core";
import { ContextualLogger, log } from "@utils/log";
import mqtt from "mqtt";
import {
  createPlaceholderMapMQTT,
  type PlaceholderMapMQTT,
} from "@citylink-edgc/placeholder";
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
  constructor(
    brokerURL: string = "mqtt://localhost:1883",
    private compatible: ControllerCompatibleTM,
    private withLogger: boolean = true,
    private brokerOpts?: mqtt.IClientOptions,
    private controllerOpts?: ControllerOpts,
  ) {
    if (!URL.canParse(brokerURL)) {
      throw new Error(`Invalid broker URL: ${brokerURL}`);
    }
    this.brokerURL = URL.parse(brokerURL)!;
  }

  produce(node: EndNode): Promise<EndNodeController> {
    return new Promise((resolve, _reject) => {
      const controller = new UMQTTCoreController(
        node,
        this.compatible,
        this.brokerURL,
        this.withLogger,
        this.brokerOpts,
        this.controllerOpts,
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
  private logger?: ContextualLogger;
  private coreStatus: CoreStatus = "UNDEF";
  private adaptationInProgress = false;
  private adaptationReplaceSet: Set<string> = new Set();
  private topicPrefix: string;
  private brokerOpts: mqtt.IClientOptions;
  private controllerOpts: ControllerOpts;

  // private prevNodeConfig?: EndNode;

  constructor(
    private node: EndNode,
    private compat: ControllerCompatibleTM,
    private brokerURL: URL,
    withLogger: boolean,
    brokerOpts?: mqtt.IClientOptions,
    controllerOpts?: ControllerOpts,
  ) {
    this.topicPrefix = `citylink/${this.node.id}/`;
    if (withLogger) {
      this.logger = new ContextualLogger(log.getLogger(import.meta.url), {
        node: this.node.id,
      });
    }

    this.brokerOpts = {
      ...brokerOpts,
      clientId: `citylink-controller-${this.node.id}`,
      clean: true, // Double Check
    };

    this.controllerOpts = {
      subscribeEventQos: controllerOpts?.subscribeEventQos ?? 1,
      observePropertyQoS: controllerOpts?.observePropertyQoS ?? 1,
    };
  }

  get endNode(): Readonly<EndNode> {
    return this.node;
  }

  get compatible(): Readonly<ControllerCompatibleTM> {
    return this.compat;
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
        this.logger?.debug(`Ignoring message on unrelated topic: ${topic}`);
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
          `Ignoring platform message for ${affordanceType} "${affordanceName}"`,
        );
        return;
      }

      this.logger?.info(
        `📩 --${affordanceType}-- ${affordanceNamespace}/${affordanceName}: ${message.toString()}`,
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
          this.logger?.error(`❌ Failed to disconnect MQTT client: ${err}`);
          reject(err);
        } else {
          this.logger?.info("✅ MQTT client disconnected successfully.");
          resolve();
        }
      });
    });
  }

  async startAdaptation(manifest: AppManifest | URL): Promise<void> {
    if (
      this.adaptationInitPromise || this.adaptationFinishPromise
    ) {
      this.logger?.warn(
        `⚠️ Adaptation already in progress. Cannot start a new one.`,
      );
      return Promise.reject(new Error("In progress"));
    }

    const placeholderMap = createPlaceholderMapMQTT(
      this.brokerURL.toString(),
      this.node.id,
      //TODO: add extra field to app manifest
    );

    const opts: ThingDescriptionOpts<PlaceholderMapMQTT> = {
      uuid: this.node.id,
      placeholderMap: placeholderMap,
    };

    // this.prevNodeConfig = this.node; // TODO: save previous config to attempt rollback if needed
    this.node = await EndNode.from(manifest, opts);

    return new Promise((resolve, reject) => {
      this.logger?.info("🔄 Starting adaptation procedure...");
      this.adaptationInitPromise = { resolve, reject };
      this.invokeAction("citylink:embeddedCore_OTAUInit").catch((err) => {
        this.logger?.error(
          `❌ Failed to invoke OTAU init action: ${err.message}`,
        );
        this.adaptationInitPromise?.reject(err);
        this.adaptationInitPromise = undefined;
      });
    });
  }

  private finishAdaptation(): Promise<void> {
    if (this.coreStatus !== "OTAU") {
      this.logger?.error(
        `❌ Cannot finish OTAU procedure in current status: ${this.coreStatus}`,
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
        this.logger?.critical(
          `❌ Failed to invoke OTAU finish action: ${err.message}`,
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
          `⚠️ Unknown core affordance type "${affordanceType}" for "${affordanceName}"`,
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
            `❌ Invalid core status value: ${value}. Expected one of ${
              CoreStatusValues.join(", ")
            }`,
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
        this.logger?.info(`Received OTAU write event: ${value}`);
        this.handleOtauReport(value);
        break;
      default:
        this.logger?.warn(
          `⚠️ Unknown core event "${affordanceName}" with value "${value}"`,
        );
    }
  }

  private handleOtauReport(value: string): void {
    const json = JSON.parse(value);
    const parsed = OTAUReport.safeParse(json);
    if (!parsed.success) {
      this.logger?.error(
        `❌ Invalid OTAU report format: ${
          JSON.stringify(parsed.error.format(), null, 2)
        }`,
      );
      return;
    }

    const { timestamp, result } = parsed.data;
    const { epoch_year = 1970, seconds } = timestamp;
    const base = Date.UTC(epoch_year, 0, 1); // January 1st of the year
    const date = new Date(base + seconds * 1000);
    this.logger?.info(
      `📅 OTAU report received at ${date.toISOString()}: ${
        JSON.stringify(result, null, 2)
      }`,
    );

    //TODO: change this to zod validation
    if (result.error) {
      //TODO: assert only one of these is present
      this.otauWritePromise?.reject(new Error(result.message));
      this.otauDeletePromise?.reject(new Error(result.message));
    } else if ("written" in result) {
      this.otauWritePromise!.resolve(result.written);
    } else if ("deleted" in result) {
      this.otauDeletePromise!.resolve(result.deleted);
    } else {
      this.logger?.error(
        "❌ Unknown OTAU report result format:",
        JSON.stringify(result),
      );
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
      `📦 Downloaded ${source.length} files for adaptation.`,
    );

    return source;
  }

  private adaptEndNode() {
    if (this.coreStatus !== "OTAU") {
      this.logger?.warn(
        `❌ Cannot start adaptation procedure in current status: ${this.coreStatus}`,
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

        this.logger?.critical(err);
        this.logger?.critical("❗️End node may be in an inconsistent state.");
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
      `📤 Deleting ${toDelete.size} file(s) from previous adaptation...`,
    );

    for (const path of toDelete) {
      try {
        this.logger?.debug(`📤 Deleting file ${path} from end node...`);
        const deletedPaths = await this.otauDelete(path, true);
        this.logger?.debug(`✅ File(s) deleted: ${deletedPaths.join(", ")}`);
      } catch (err) {
        this.logger?.error(`❌ Failed to delete file ${path}:`, err);
        throw new Error("❗️Adaptation failed due to deletion error.");
      }
    }
  }

  private async adaptationWriteFiles(source: SourceFile[]): Promise<void> {
    this.logger?.info("📥 Writing files to end node...");
    for (const file of source) {
      try {
        this.logger?.debug(`📥 Writing file ${file.path}`);

        const writtenPath = await this.otauWrite(file);

        if (writtenPath !== file.path) {
          this.logger?.warn(
            `⚠️ Written path "${writtenPath}" does not match expected "${file.path}".`,
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
        this.logger?.error(`❌ Failed to write file ${file.path}:`, err);
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
      this.logger?.info(`📤 Writing file ${file.path} to end node...`);
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
        `❌ Cannot delete core directory "${path}" recursively.`,
      );
      return Promise.reject(
        new Error(`Cannot delete core directory "${path}" recursively.`),
      );
    }

    return new Promise<string[]>((resolve, reject) => {
      const delType = recursive ? "directory" : "file";

      this.logger?.info(`📤 Deleting ${delType} "${path}" from end node...`);
      this.otauDeletePromise = { resolve, reject };

      this.invokeAction("citylink:embeddedCore_OTAUDelete", deleteInput).catch(
        (err) => {
          this.logger?.error(`❌ Failed to delete ${delType} "${path}":`, err);
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
        `📤 Publishing value: ${JSON.stringify(value)} to topic: ${opts.topic}`,
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
            `❌ Failed to publish default property "${name}": ${err.message}`,
          );
        });
      } else {
        this.logger?.warn(`⚠️ No MQTT config for property "${name}"`);
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
        this.logger?.debug(`Skipping ${type} "${name}" due to ignore prefix`);
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
        this.logger?.error(`❌ Subscription failed for "${name}":`, err);
      } else {
        this.logger?.info(`📡 Subscribed to "${name}" on topic "${topic}"`);
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
      `📤 Invoking action "${name}" with input: ${actionInput}`,
    );

    return new Promise((resolve, reject) => {
      this.publish(actionInput, opts)
        .then(() => {
          this.logger?.info(`✅ Action "${name}" invoked successfully.`);
          resolve();
        })
        .catch((err) => {
          this.logger?.error(`❌ Failed to invoke action "${name}":`, err);
          reject(err);
        });
    });
  }
}
