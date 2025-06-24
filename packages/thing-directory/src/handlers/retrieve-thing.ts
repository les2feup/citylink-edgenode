import type { EdgeConnector } from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import { errorResponse } from "../utils/error-response.ts";

const logger = createLogger("TDD", "RetrieveThing");
/**
 * Implements the logic for the GET /things/{id} endpoint (retrieveThing action).
 * Retrieves a specific Thing Description based on the provided ID.
 * @param thingId The ID of the Thing to retrieve from the path.
 * @returns A Response containing the JSON Thing Description, or a 404 if not found.
 */
export function retrieveThing(
  connectors: EdgeConnector[],
  thingId: string,
): Response {
  logger.debug({ thingId }, "Retrieving Thing");

  for (const connector of connectors) {
    for (const node of connector.getRegisteredNodes()) {
      if (node.thingDescription.id === thingId || node.id === thingId) {
        logger.debug({ thingId }, "Retrieved Thing");
        return new Response(JSON.stringify(node.thingDescription), {
          headers: { "Content-Type": "application/td+json" }, // According to Thing Model specification
        });
      }
    }
  }

  // If the thingId is not found after checking all connectors, return a 404 Not Found.
  return errorResponse(`Thing with id ${thingId} not found`, 404);
}
