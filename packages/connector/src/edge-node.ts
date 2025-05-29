import type { EdgeConnector } from "./edge-connector.ts";

export type Compatible = {
  title: string;
  version: string;
};

export class EdgeNode {
  private registeredConnectors: Map<Compatible, EdgeConnector>;
  /// web api endpoints will go here
}

// global package layout:
// citylink/edgenode/edgenode <- this package
// citylink/edgenode/edge-connector/mqtt <- edge connector for MQTT
// citylink/edgenode/edge-connector/umqtt-controller <- controller implmentation for the upy+mqtt Embedded Core
