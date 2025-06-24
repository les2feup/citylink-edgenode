import { type EdgeConnector, utils as clUtils } from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import { errorResponse } from "../utils/error-response.ts";

const logger = createLogger("TDD", "StartEndNodeAdaptation");

export async function startAdaptation(
  connectors: EdgeConnector[],
  thingId: string,
  tm: URL | unknown,
): Promise<Response> {
  logger.debug({ thingId }, "Adaptation invoked");

  // Validate the Thing ID and Thing Model
  if (!thingId || !tm) {
    return errorResponse(
      "Thing ID and Thing Model are required.",
      400,
    );
  }

  logger.debug({ thingId }, "Validating inputs");

  // Find the EdgeConnector for the given Thing ID
  const connector = connectors.find((ec) =>
    ec.getRegisteredNodes().some((n) =>
      n.thingDescription.id === thingId || n.id === thingId //TODO: remove double check
    )
  );

  if (!connector) {
    logger.warn({ thingId }, "No EdgeConnector found for Thing ID");
    return errorResponse(
      `Thing ID ${thingId} registered with any EdgeConnector`,
      404,
    );
  }

  // Validate the Thing Model
  if (!(tm instanceof URL) && !clUtils.isValidThingModel(tm)) {
    logger.error("Bad request: Invalid input. Not Thing Model or URL.");
    return errorResponse(
      "Bad request: Invalid input. Not Thing Model or URL.",
      400,
    );
  }

  // Start the adaptation process (is a placeholder, actual implementation needed)
  try {
    logger.debug({ thingId }, "Invoking connector to start adaptation");
    await connector.startNodeAdaptation(thingId, tm);
    return new Response(
      `Adaptation started for Thing ID ${thingId} with model ${tm}`,
      { status: 200 },
    );
  } catch (err) {
    logger.error(err, "Failed to start end node adaptation");
    return errorResponse(
      `Failed to start adaptation: ${err instanceof Error ? err.message : err}`,
      500,
    );
  }
}
