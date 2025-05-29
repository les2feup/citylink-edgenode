import type { EndNode } from "../end-node.ts";
import type { AppManifest } from "../types/zod/app-manifest.ts";

export interface EndNodeController {
  readonly node: EndNode;

  start(): Promise<void>;
  stop(): Promise<void>;

  startAdaptation(manifest: AppManifest | URL): Promise<void>;
}

export interface EndNodeControllerFactory {
  produce(node: EndNode): Promise<EndNodeController>;
}
