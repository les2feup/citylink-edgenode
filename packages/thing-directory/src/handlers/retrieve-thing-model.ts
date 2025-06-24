import { CacheService } from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import { errorResponse } from "../utils/error-response.ts";

const logger = createLogger("TDD", "RetrieveThingModel");

export async function retrieveThingModel(title: string): Promise<Response> {
  title = decodeURIComponent(title);
  logger.debug({ title }, "Retrieving Thing Model");

  const thingModel = await CacheService
    .getThingModelCache().get(title);
  if (!thingModel) {
    logger.warn({ title }, "Thing Model not found");
    return errorResponse(
      `Thing Model with title ${title} not found`,
      404,
    );
  }

  logger.debug({ title }, "Retrieved Thing Model");
  return new Response(JSON.stringify(thingModel), {
    headers: { "Content-Type": "application/tm+json" },
  });
}
