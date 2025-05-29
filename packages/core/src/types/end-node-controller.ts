import type { EndNode } from "../end-node.ts";
import type { AppManifest } from "../types/zod/app-manifest.ts";

export interface Controller {
  readonly node: EndNode;

  start(): Promise<void>;
  stop(): Promise<void>;

  startAdaptation(manifest: AppManifest | URL): Promise<void>;
}

export interface ControllerFactory {
  produce(node: EndNode): Promise<Controller>;
}
