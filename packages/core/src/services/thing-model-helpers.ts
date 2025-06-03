import type { Resolver } from "@eclipse-thingweb/thing-model";
import { ThingModelHelpers } from "@eclipse-thingweb/thing-model";
import { getThingModelCache } from "./cache-registry.ts";

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
      await cache.set(uri, model);

      return model;
    } catch (error) {
      throw new Error(`Error fetching model: ${error}`);
    }
  }
}

export const getTmTools = () => {
  return new ThingModelHelpers(new modelResolver());
};
