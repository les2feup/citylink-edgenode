import type { ThingModel } from "npm:wot-thing-model-types";
import type { ThingDescription } from "npm:wot-thing-description-types";
import type { EndNode } from "../end-node.ts";
import type { AppManifest } from "../types/zod/app-manifest.ts";

export interface ConnectorOpts {
  [key: string]: unknown;
}

export interface EdgeConnectorFactory<
  Opts extends ConnectorOpts = ConnectorOpts,
> {
  produce(tm: ThingModel, tmUrl?: URL, opts?: Opts): EdgeConnector;
}

// Each connector manages a set of end nodes that it is compatible with.
// We can maybe have a thread per registered node in the future.
export interface EdgeConnector {
  readonly td: ThingDescription;

  // Initiates the connector, listening for incoming connections
  init(): Promise<void>;
  registerNode(): void; // TODO:
  getRegisteredNodes(): Promise<ReadonlyArray<EndNode>>;
  getNodeByUuid(uuid: string): Promise<Readonly<EndNode> | undefined>;
  signalNodeAdaptation(
    uuid: string,
    newManifest: URL | AppManifest,
  ): Promise<void>;
}

// Edge connector is composed of Registration Listener + Nodes Controllers
