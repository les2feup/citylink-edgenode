import { CacheService, type ThingModel } from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import { handleListRequestOutput } from "../utils/pagination.ts";

const logger = createLogger("TDD", "ListThingModels");

export async function listThingModels(
  uriVars: URLSearchParams,
): Promise<Response> {
  logger.debug("Listing Thing Models");

  const allThingModels: Readonly<ThingModel[]> = await CacheService
    .getThingModelCache().getAll();

  return handleListRequestOutput(
    allThingModels,
    "thing-models",
    uriVars,
  );
}
