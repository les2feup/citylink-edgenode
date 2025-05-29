import type { EndNode } from "../end-node.ts";
import type { GenericOpts } from "../types/generic-opts.ts";

export interface Opts extends GenericOpts {}

export interface Listener<
  RLOpts extends Opts,
> {
  start(
    opts: RLOpts,
    onNodeRegistered: (node: EndNode) => Promise<void>,
  ): Promise<void>;
  stop(): Promise<void>;
}
