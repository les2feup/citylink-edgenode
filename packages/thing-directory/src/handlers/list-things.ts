import type { EdgeConnector, ThingDescription } from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import { handleListRequestOutput } from "../utils/pagination.ts";

const logger = createLogger("TDD", "ListThings");

/**
 * Implements the logic for the GET /things endpoint.
 * Collects Thing Descriptions from all registered EdgeConnectors, supporting pagination.
 * @param uriVars The URLSearchParams containing 'offset', 'limit', and 'format' variables.
 * @returns A Response containing a JSON array or collection of Thing Descriptions.
 */
export function listThings(
  connectors: EdgeConnector[],
  uriVars: URLSearchParams,
): Response {
  logger.debug("Listing Things");

  const allThings: ThingDescription[] = connectors.flatMap(
    (ec) => ec.getRegisteredNodes().map((n) => n.thingDescription),
  );

  return handleListRequestOutput(
    allThings,
    "things",
    uriVars,
  );
}
