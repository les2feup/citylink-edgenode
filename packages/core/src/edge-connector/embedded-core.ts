import type { EndNode } from "../end-node.ts";
import type { GenericOpts } from "../types/generic-opts.ts";
import type { AppManifest } from "../types/zod/app-manifest.ts";

export interface Opts extends GenericOpts {}

export interface Controller<COpts extends Opts> {
  readonly node: EndNode;
  readonly opts: COpts;

  start(): Promise<void>;
  stop(): Promise<void>;

  startAdaptation(manifest: AppManifest | URL): Promise<void>;
}

export interface ControllerFactory<
  COpts extends Opts,
  ECC extends Controller<COpts>,
> {
  produce(node: EndNode, opts: COpts): ECC;
}
