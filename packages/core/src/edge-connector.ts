import type { ThingModel } from "npm:wot-thing-model-types";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type { EndNode } from "./end-node.ts";
import type { AppManifest } from "./types/zod/app-manifest.ts";
import type { RegistrationListener } from "./types/registration-listener.ts";
import type { TMCompatible } from "./types/tm-compatible.ts";
import type {
  EndNodeController,
  EndNodeControllerFactory,
} from "./types/end-node-controller.ts";
import type {
  TemplateMap,
  ThingDescriptionOpts,
} from "./types/thing-description-opts.ts";
import { produceTD } from "./services/produce-thing-description.ts";
import { initLogger } from "@utils/log";

interface RegisteredController {
  readonly td: ThingDescription;
  readonly compatible: TMCompatible;
  readonly factory: EndNodeControllerFactory;
}

export class EdgeConnectorFactory {
  static async produce(
    tm: ThingModel,
    opts: ThingDescriptionOpts<TemplateMap>,
    regListener: RegistrationListener,
  ): Promise<EdgeConnector> {
    const td = await produceTD(tm, opts);
    return new EdgeConnector(
      td,
      regListener,
    );
  }
}

export class EdgeConnector {
  private readonly controllers = new Map<
    string,
    EndNodeController
  >();

  private readonly controllerRegistry: RegisteredController[] = [];

  constructor(
    readonly td: ThingDescription,
    private readonly regListener: RegistrationListener,
  ) {
  }

  async start(): Promise<void> {
    return await this.regListener.start(this.registerNode.bind(this));
  }

  async stop(): Promise<void> {
    await this.regListener.stop();
    await Promise.all(
      Array.from(this.controllers.values()).map((controller) =>
        controller.stop()
      ),
    );
    this.controllers.clear();
  }

  async registerControllerFactory(
    tm: ThingModel,
    opts: ThingDescriptionOpts<TemplateMap>,
    factory: EndNodeControllerFactory,
  ): Promise<void> {
    const compatible: TMCompatible = {
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

  getRegisteredNodes(): ReadonlyArray<EndNode> {
    return Array.from(this.controllers.entries()).map(([_uuid, controller]) => {
      return controller.node;
    });
  }

  getNodeByUuid(uuid: string): Readonly<EndNode> | undefined {
    const controller = this.controllers.get(uuid);
    if (!controller) {
      return undefined;
    }
    return controller.node;
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

  private async registerNode(
    node: EndNode,
    comp: TMCompatible,
  ): Promise<void> {
    const match = this.controllerRegistry.find(
      (entry) =>
        entry.compatible.title === comp.title &&
        entry.compatible.version === comp.version,
    );

    if (!match) {
      throw new Error(`No compatible controller for node ${node.id}`);
    }

    const controller = await match.factory.produce(node);
    this.controllers.set(node.id, controller);
    await controller.start();

    //TODO: add link to the new node's TD in the edge connector's TD
    //      or the controller's TD using the collection/item relationship
  }
}
