import type { Cache } from "../types/cache.ts";

export class InMemoryCache<K, V> implements Cache<K, V> {
  private cache: Map<K, V>;

  constructor() {
    this.cache = new Map<K, V>();
  }

  getMap(): Promise<ReadonlyMap<K, V>> {
    return Promise.resolve(this.cache);
  }

  getAll(): Promise<ReadonlyArray<V>> {
    return Promise.resolve(Array.from(this.cache.values()));
  }

  get(key: K): Promise<V | undefined> {
    return Promise.resolve(this.cache.get(key));
  }

  set(key: K, value: V): Promise<void> {
    this.cache.set(key, value);
    return Promise.resolve();
  }
}
