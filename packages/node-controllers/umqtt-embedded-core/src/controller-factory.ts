import type {
  ControllerCompatibleTM,
  EndNode,
  EndNodeController,
  EndNodeControllerFactory,
  ThingDescriptionOpts,
  ThingModel,
} from "@citylink-edgenode/core";
import type mqtt from "mqtt";
import { uMQTTCoreController } from "./controller.ts";

export class UMQTTCoreControllerFactory implements EndNodeControllerFactory {
  #brokerURL: URL;
  #compatible: ControllerCompatibleTM;
  #brokerOpts: mqtt.IClientOptions;
  constructor(
    tm: ThingModel,
    _opts?: ThingDescriptionOpts,
    brokerURL?: string,
    brokerOpts?: mqtt.IClientOptions,
  ) {
    const url = brokerURL ?? "mqtt://localhost:1883";
    if (!URL.canParse(url)) {
      throw new Error(`Invalid broker URL: ${url}`);
    }
    this.#brokerURL = URL.parse(url)!;
    this.#brokerOpts = brokerOpts ?? {};

    this.#compatible = {
      title: tm.title!,
      version: typeof tm.version! === "string"
        ? tm.version!
        : tm.version!.model!,
    };
  }

  get compatible(): Readonly<ControllerCompatibleTM> {
    return this.#compatible;
  }

  produce(node: EndNode): Promise<EndNodeController> {
    return new Promise((resolve, _reject) => {
      const controller = new uMQTTCoreController(
        node,
        this.#compatible,
        this.#brokerURL,
        this.#brokerOpts,
      );
      resolve(controller);
    });
  }
}
