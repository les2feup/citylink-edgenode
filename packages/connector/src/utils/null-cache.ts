import type { Cache } from "../types/cache.ts";

export class NullCache<K, V> implements Cache<K, V> {
  get(_key: K): Promise<V | undefined> {
    return Promise.resolve(undefined);
  }

  set(_key: K, _value: V): Promise<void> {
    return Promise.resolve();
  }
}
