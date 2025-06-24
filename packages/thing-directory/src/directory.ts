import { createLogger } from "common/log";
import { handleRequest } from "./router.ts";
import { withCors } from "./utils/cors.ts";
import type { EdgeConnector } from "@citylink-edgenode/core";

export class ThingDirectory {
  private connectorInstances: EdgeConnector[] = [];
  private logger = createLogger("TDD", "main");

  addEdgeConnector(ec: EdgeConnector) {
    if (this.connectorInstances.some((e) => e.id === ec.id)) {
      this.logger.warn(`EdgeConnector with id ${ec.id} already exists.`);
      return;
    }
    this.connectorInstances.push(ec);
  }

  start(hostname: string = "localhost", port: number = 8080) {
    this.logger.info({ hostname, port }, "Starting CityLink Directory");
    Deno.serve(
      { hostname, port },
      async (req) => {
        // Handle CORS preflight requests
        if (req.method === "OPTIONS") {
          return withCors(new Response(null, { status: 204 }));
        }

        const response = await handleRequest(req, this.connectorInstances);
        return withCors(response);
      },
    );
  }
}
