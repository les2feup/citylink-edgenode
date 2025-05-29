import type { EndNode } from "../end-node.ts";
import type { TMCompatible } from "../types/tm-compatible.ts";

export interface RegistrationListener {
  start(
    onNodeRegistered: (
      node: EndNode,
      compatible: TMCompatible,
    ) => Promise<void>,
  ): Promise<void>;

  stop(): Promise<void>;
}
