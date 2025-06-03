import type { EndNode } from "../end-node.ts";
import type { AppManifest } from "../types/zod/app-manifest.ts";

export type ControllerCompatibleTM = {
  title: string;
  version: string;
};

export interface EndNodeController {
  stop(): void | Promise<void>;
  start(): void | Promise<void>;

  startAdaptation(manifest: AppManifest | URL): Promise<void>;

  get endNode(): Readonly<EndNode>;
  get compatible(): Readonly<ControllerCompatibleTM>;
}

export interface EndNodeControllerFactory {
  produce(node: EndNode): Promise<EndNodeController>;
  get compatible(): Readonly<ControllerCompatibleTM>;
}
