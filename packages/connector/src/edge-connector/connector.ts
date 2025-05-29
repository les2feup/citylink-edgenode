import type { ThingModel } from "npm:wot-thing-model-types";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type { EndNode } from "../end-node.ts";
import type { AppManifest } from "../types/zod/app-manifest.ts";
import type * as EmbeddedCore from "./embedded-core.ts";
import type * as RegistrationListener from "./registration-listener.ts";
import type { TemplateMap } from "../types/thing-description-opts.ts";
import { produceTD } from "../services/produce-thing-description.ts";

export type TMCompatible = {
  title: string;
  version: string;
};

//TODO: Define this type
export interface EdgeConnectorTemplateMap extends TemplateMap {}

export interface Opts {
  controller: EmbeddedCore.Opts;
  listener: RegistrationListener.Opts;
}

export class EdgeConnectorFactory<
  PRL extends RegistrationListener.Listener<Opts["listener"]>,
  ECC extends EmbeddedCore.Controller<Opts["controller"]>,
> {
  async produce(
    tm: ThingModel,
    templateMap: EdgeConnectorTemplateMap,
    regListener: PRL,
    controllerFactory: EmbeddedCore.ControllerFactory<
      Opts["controller"],
      ECC
    >,
    opts: Opts,
  ): Promise<EdgeConnector<PRL, ECC>> {
    const td = await produceTD<EdgeConnectorTemplateMap>(
      tm,
      {
        templateMap,
      },
    );

    const compatible: TMCompatible = {
      title: tm.title!,
      version: typeof tm.version! === "string"
        ? tm.version!
        : tm.version!.model!,
    };

    return new EdgeConnector<PRL, ECC>(
      td,
      compatible,
      regListener,
      controllerFactory,
      opts,
    );
  }
}

// Edge connector is composed of Registration Listener + Node Controllers
export class EdgeConnector<
  PRL extends RegistrationListener.Listener<Opts["listener"]>,
  ECC extends EmbeddedCore.Controller<Opts["controller"]>,
> {
  protected readonly controllers = new Map<string, ECC>();

  constructor(
    readonly td: ThingDescription,
    readonly compatible: TMCompatible,
    protected readonly regListener: PRL,
    protected readonly controllerFactory: EmbeddedCore.ControllerFactory<
      Opts["controller"],
      ECC
    >,
    protected readonly opts: Opts,
  ) {}

  // TODO: Controller instances are independent. How to ensure that
  //       all are able to run in parallel? One busy controller should
  //       not block the event loop for other controllers.
  protected async registerNode(node: EndNode): Promise<void> {
    const controller = this.controllerFactory.produce(
      node,
      this.opts.controller,
    );
    this.controllers.set(node.id, controller);
    await controller.start();

    //TODO: add link to the new node's TD in the edge connector's TD
    //      using the collection/item relationship
  }

  async start(): Promise<void> {
    return await this.regListener.start(
      this.opts.listener,
      async (node: EndNode) => {
        await this.registerNode(node);
      },
    );
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
}
