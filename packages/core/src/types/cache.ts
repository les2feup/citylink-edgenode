import type { ThingModel } from "./thing-model-types.ts";
import type { AppContentTypes, Manifest } from "./zod/manifest.ts";

export interface Cache<K, V> {
  /**
   * Retrieves an item from the cache by its key.
   * @param key - The key of the item to retrieve.
   * @returns The cached item or undefined if not found.
   */
  get(key: K): Promise<V | undefined>;


  /**
   * Retrieves all items from the cache as a Map.
   * * @returns A Promise that resolves to a Map containing all cached items,
   */
  getMap(): Promise<ReadonlyMap<K, V>>;

  /**
   * Retrieves all items from the cache as an array.
   * @returns A Promise that resolves to an array of all cached items.
   */
  getAll(): Promise<ReadonlyArray<V>>;

  /**
   * Sets an item in the cache with a specified key.
   * @param key - The key under which to store the item.
   * @param value - The item to store in the cache.
   */
  set(key: K, value: V): Promise<void>;
}

export interface AppManifestCache extends Cache<string, Manifest> {}
export interface AppContentCache extends Cache<string, AppContentTypes> {}
export interface ThingModelCache extends Cache<string, ThingModel> {}
