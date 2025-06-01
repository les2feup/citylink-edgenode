import type { ContextualLogger, log } from "@utils/log";
import type { ThingModel } from "npm:wot-thing-model-types";
import type { AppManifest } from "./types/zod/app-manifest.ts";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type { EndNode } from "./end-node.ts";
import type {
  ControllerCompatibleTM,
  EndNodeController,
  EndNodeControllerFactory,
} from "./types/end-node-controller.ts";
import type {
  CityLinkPlaceholderMap,
  ThingDescriptionOpts,
} from "./types/thing-description-opts.ts";

import { produceTD } from "./services/produce-thing-description.ts";
import { v4 } from "jsr:@std/uuid";

interface RegisteredController {
  readonly td: ThingDescription;
  readonly compatible: ControllerCompatibleTM;
  readonly factory: EndNodeControllerFactory;
}

export abstract class EdgeConnector {
  protected readonly controllers = new Map<
    string,
    EndNodeController
  >();

  protected readonly controllerRegistry: RegisteredController[] = [];
  protected readonly uuid: string;
  protected logger?: log.Logger | ContextualLogger;

  constructor(
    readonly td: ThingDescription,
  ) {
    if (!v4.validate(td.id!)) {
      throw new Error(`Invalid UUID: ${td.id!}`);
    }

    this.uuid = td.id!;
  }

  abstract startRegistrationListener(): Promise<void>;
  abstract stopRegistrationListener(): Promise<void>;

  async stopNodeController(
    uuid: string,
  ): Promise<void> {
    const controller = this.controllers.get(uuid);
    if (!controller) {
      this.logger?.warn(`Controller for UUID ${uuid} not found`);
      return;
    }

    await controller.stop();
    this.controllers.delete(uuid);
    this.logger?.info(`Node controller for UUID ${uuid} stopped and removed.`);
  }

  async stopAllNodeControllers(): Promise<void> {
    this.logger?.info("Stopping all node controllers...");
    await Promise.all(
      Array.from(this.controllers.values()).map((controller) =>
        controller.stop()
      ),
    );
    this.controllers.clear();
    this.logger?.info("All node controllers stopped.");
  }

  async registerControllerFactory(
    tm: ThingModel,
    opts: ThingDescriptionOpts<CityLinkPlaceholderMap>,
    factory: EndNodeControllerFactory,
  ): Promise<void> {
    //TODO: Double check this
    const compatible: ControllerCompatibleTM = {
      title: tm.title!,
      version: typeof tm.version! === "string"
        ? tm.version!
        : tm.version!.model!,
    };

    const td = await produceTD(tm, opts);
    this.controllerRegistry.push({
      td,
      compatible,
      factory,
    });
  }

  getRegisteredNodes(): Readonly<EndNode>[] {
    return Array.from(this.controllers.entries()).map(([_uuid, controller]) => {
      return controller.endNode;
    });
  }

  getNodeByUuid(uuid: string): Readonly<EndNode> | undefined {
    const controller = this.controllers.get(uuid);
    if (!controller) {
      return undefined;
    }
    return controller.endNode;
  }

  startNodeAdaptation(
    uuid: string,
    newManifest: AppManifest | URL,
  ): Promise<void> {
    const controller = this.controllers.get(uuid);
    if (!controller) {
      return Promise.reject(new Error(`Controller for UUID ${uuid} not found`));
    }
    return controller.startAdaptation(newManifest);
  }

  protected async startNodeController(
    node: EndNode,
  ): Promise<void> {
    if (this.controllers.has(node.id)) {
      this.logger?.warn(`Node ${node.id} is already registered.`);
      return;
    }

    const match = this.controllerRegistry.find(
      (entry) =>
        entry.compatible.title === node.controllerCompatible.title &&
        entry.compatible.version === node.controllerCompatible.version,
    );

    if (!match) {
      throw new Error(`No compatible controller for node ${node.id}`);
    }

    const controller = await match.factory.produce(node);
    this.controllers.set(node.id, controller);
    await controller.start();

    this.logger?.info(`Node controller launched for node: ${node.id}`);

    //TODO: add link to the new node's TD in the edge connector's TD
    //      or the controller's TD using the collection/item relationship
  }
}
