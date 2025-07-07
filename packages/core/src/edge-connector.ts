import { createLogger } from "common/log";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type { EndNode } from "./end-node.ts";
import type {
  EndNodeController,
  EndNodeControllerFactory,
} from "./types/end-node-controller.ts";
import type { ThingModel } from "./types/thing-model-types.ts";

export abstract class EdgeConnector {
  protected readonly controllers = new Map<
    string,
    EndNodeController
  >();

  protected readonly controllerFactories: EndNodeControllerFactory[] = [];
  protected readonly uuid: string;
  protected logger? = createLogger("core", "EdgeConnector");

  constructor(
    readonly td: ThingDescription,
  ) {
    this.uuid = td.id!;
  }

  abstract startRegistrationListener(): Promise<void>;
  abstract stopRegistrationListener(): Promise<void>;

  get id(): Readonly<string> {
    return this.uuid;
  }

  async stopNodeController(
    uuid: string,
  ): Promise<void> {
    const controller = this.controllers.get(uuid);
    if (!controller) {
      this.logger?.warn(`Controller for UUID ${uuid} not found`);
      return;
    }

    await controller.stop(); // always await as (void) can be awaited safely
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

  registerControllerFactory(
    factory: EndNodeControllerFactory,
  ) {
    //Check if any registered fatory has the same compatible as the new
    if (
      this.controllerFactories.some((fac) =>
        fac.compatible.title === factory.compatible.title &&
        fac.compatible.version === factory.compatible.version
      )
    ) {
      throw new Error("Trying to register duplicate factory");
    }
    this.controllerFactories.push(factory);
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

  async adaptEndNode(
    uuid: string,
    newTM: URL,
  ): Promise<void> {
    const controller = this.controllers.get(uuid) ||
      this.controllers.get(uuid.split("urn:uuid:")[1]); //TODO: remove the need for this
    if (!controller) {
      throw new Error(`Controller for UUID ${uuid} not found`);
    }
    return await controller.adaptEndNode(newTM);
  }

  protected async startNodeController(
    node: EndNode,
  ): Promise<void> {
    if (this.controllers.has(node.id)) {
      this.logger?.warn(`Node ${node.id} is already registered.`);
      return;
    }

    const factory = this.controllerFactories.find(
      (entry) =>
        entry.compatible.title === node.controllerCompatible.title &&
        entry.compatible.version === node.controllerCompatible.version,
    );

    if (!factory) {
      throw new Error(`No compatible controller for node ${node.id}`);
    }

    const controller = await factory.produce(node);
    this.controllers.set(node.id, controller);
    await controller.start(); // Always await as (void) can be awaited safely

    this.logger?.info(`Node controller launched for node: ${node.id}`);

    //TODO: add link to the new node's TD in the edge connector's TD
    //      or the controller's TD using the collection/item relationship
  }
}
