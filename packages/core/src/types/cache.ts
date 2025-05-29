import type { ThingModel } from "npm:wot-thing-model-types";
import type { AppManifest } from "./zod/app-manifest.ts";

export interface Cache<K, V> {
  /**
   * Retrieves an item from the cache by its key.
   * @param key - The key of the item to retrieve.
   * @returns The cached item or undefined if not found.
   */
  get(key: K): Promise<V | undefined>;

  /**
   * Sets an item in the cache with a specified key.
   * @param key - The key under which to store the item.
   * @param value - The item to store in the cache.
   */
  set(key: K, value: V): Promise<void>;
}

export interface AppManifestCache extends Cache<string, AppManifest> {}
export interface ThingModelCache extends Cache<string, ThingModel> {}

