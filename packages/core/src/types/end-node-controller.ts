import type { EndNode } from "../end-node.ts";
import type { AppManifest } from "../types/zod/app-manifest.ts";

export type ControllerCompatibleTM = {
  title: string;
  version: string;
};

export interface EndNodeController {
  start(): Promise<void>;
  stop(): Promise<void>;

  startAdaptation(manifest: AppManifest | URL): Promise<void>;

  get endNode(): Readonly<EndNode>;
  get compatible(): Readonly<ControllerCompatibleTM>;
}

export interface EndNodeControllerFactory {
  produce(node: EndNode): Promise<EndNodeController>;
}
