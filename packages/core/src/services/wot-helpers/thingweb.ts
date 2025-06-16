import type {
  CompositionOptions,
  Resolver,
} from "@eclipse-thingweb/thing-model";
import { ThingModelHelpers } from "@eclipse-thingweb/thing-model";
import { getThingModelCache } from "../cache-registry.ts";
import type { ThingModel } from "../../types/thing-model-types.ts";
import { isValidThingModel } from "./validators.ts";

class modelResolver implements Resolver {
  async fetch(uri: string): Promise<unknown> {
    const cache = getThingModelCache();
    const cachedModel = await cache.get(uri);
    if (cachedModel) {
      return Promise.resolve(cachedModel);
    }

    try {
      const response = await fetch(uri);
      if (!response.ok) {
        throw new Error(`Failed to fetch model from ${uri}`);
      }

      const model = await response.json();
      // set a deep copy of the model in cache
      await cache.set(uri, structuredClone(model));

      return model;
    } catch (error) {
      throw new Error(`Error fetching model: ${error}`);
    }
  }
}

export async function fetchThingModel(uri: string): Promise<ThingModel> {
  const rawTm = await new ThingModelHelpers(new modelResolver()).fetchModel(
    uri,
  );
  if (isValidThingModel(rawTm)) {
    return rawTm;
  }
  throw new Error(
    `Invalid Thing Model fetched from ${uri}}`,
  );
}

export function producePartialTDs(
  model: unknown,
  options?: CompositionOptions,
): Promise<WoT.ExposedThingInit[]> {
  return new ThingModelHelpers(new modelResolver()).getPartialTDs(
    model,
    options,
  );
}
