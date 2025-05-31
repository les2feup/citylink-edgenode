import type { EndNode } from "../end-node.ts";
import type { AppManifest } from "../types/zod/app-manifest.ts";

export interface EndNodeController {
  start(): Promise<void>;
  stop(): Promise<void>;

  startAdaptation(manifest: AppManifest | URL): Promise<void>;

  get EndNode(): Readonly<EndNode>;
}

export interface EndNodeControllerFactory {
  produce(node: EndNode): Promise<EndNodeController>;
}
