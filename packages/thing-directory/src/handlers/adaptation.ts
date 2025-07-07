import {
  CacheService,
  type EdgeConnector,
  isValidThingModel,
} from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import { errorResponse } from "../utils/error-response.ts";

const logger = createLogger("TDD", "StartEndNodeAdaptation");

export type AdaptationInput = {
  tmUrl: string;
  tm?: unknown;
};

export async function adaptEndNode(
  connectors: EdgeConnector[],
  thingId: string,
  { tmUrl: url, tm }: AdaptationInput,
): Promise<Response> {
  logger.debug({ thingId }, "Adaptation invoked");

  // Validate the Thing ID and Thing Model
  if (!thingId || !url || !URL.canParse(url)) {
    return errorResponse(
      "Thing ID and Thing Model URL are required.",
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
  if (tm) { // TODO: maybe this should not be done here
    if (isValidThingModel(tm)) {
      CacheService.getThingModelCache().set(url, tm);
    } else {
      logger.error("Invalid Thing Model provided");
      return errorResponse(
        "Invalid Thing Model provided.",
        400,
      );
    }
  }

  // Start the adaptation process (is a placeholder, actual implementation needed)
  try {
    logger.debug({ thingId }, "Invoking connector to start adaptation");
    await connector.adaptEndNode(thingId, URL.parse(url)!); //TODO: remove the option of passing a TM?
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
