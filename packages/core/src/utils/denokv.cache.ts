import type { Cache } from "../types/cache.ts";

export class DenoKV<K, V> implements Cache<K, V> {
  private kv?: Deno.Kv; // The Deno.Kv instance for accessing the key-value store
  private readonly path: string; // Path to the Deno KV store, used for initialization
  private readonly KEY_PREFIX: Deno.KvKey; // A prefix to store our cache data under

  constructor(path: string = ".citylink.cache", prefix: string[] = ["cache"]) {
    // Deno.openKv() returns a Promise, so the constructor itself cannot directly await it.
    // However, for this class, we'll open it synchronously assuming it's available.
    // In a real application, you might want an async factory function or an init method.
    this.path = path;
    this.KEY_PREFIX = prefix;
  }

  private async init(): Promise<void> {
    if (!this.kv) {
      this.kv = await Deno.openKv(this.path);
    }
  }

  // Helper to create the full key for Deno.Kv
  private createKvKey(key: K): Deno.KvKey {
    // Assuming K can be safely converted to a string or is already a string/number
    // For more complex K types, you'd need a serialization strategy.
    const normalizedKey =
      typeof key === "object" && key !== null && "toString" in key
        ? key.toString()
        : String(key);
    return [...this.KEY_PREFIX, normalizedKey];
  }

  async getMap(): Promise<ReadonlyMap<K, V>> {
    await this.init(); // Ensure the KV store is initialized

    const map = new Map<K, V>();
    const iter = this.kv!.list<V>({ prefix: this.KEY_PREFIX });

    for await (const entry of iter) {
      // Assuming the last element of the Deno.KvKey array is the actual key K
      // This requires K to be compatible with Deno.KvKeyPart (string | number | bigint | boolean)
      const originalKey = entry.key[entry.key.length - 1] as K;
      map.set(originalKey, entry.value);
    }
    return map;
  }

  async getAll(): Promise<ReadonlyArray<V>> {
    await this.init(); // Ensure the KV store is initialized

    const values: V[] = [];
    const iter = this.kv!.list<V>({ prefix: this.KEY_PREFIX });

    for await (const entry of iter) {
      values.push(entry.value);
    }
    return values;
  }

  async get(key: K): Promise<V | undefined> {
    await this.init(); // Ensure the KV store is initialized

    const kvKey = this.createKvKey(key);
    const entry = await this.kv!.get<V>(kvKey);
    return entry.value ?? undefined; // Deno.KvEntry.value can be null
  }

  async set(key: K, value: V): Promise<void> {
    await this.init(); // Ensure the KV store is initialized

    const kvKey = this.createKvKey(key);
    await this.kv!.set(kvKey, value);
  }

  async delete(key: K): Promise<void> {
    await this.init(); // Ensure the KV store is initialized

    const kvKey = this.createKvKey(key);
    await this.kv!.delete(kvKey);
  }

  // You might also want a close method to ensure the KV store is closed properly
  close(): void {
    if (!this.kv) {
      throw new Error("Deno.Kv is not initialized.");
    }
    this.kv.close();
  }
}
