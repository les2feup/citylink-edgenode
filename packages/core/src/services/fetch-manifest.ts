import { Manifest } from "../types/zod/manifest.ts";
import { getAppManifestCache } from "./cache-registry.ts";

export async function fetchManifest(
  modelTitle: string,
  url: URL,
): Promise<Manifest> {
  const cache = getAppManifestCache();

  try {
    const cachedManifest = await cache.get(modelTitle);
    if (cachedManifest) {
      return cachedManifest;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch app manifest: ${response.statusText}`);
    }
    const json = await response.json();
    const parsed = Manifest.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `Invalid app manifest: ${
          JSON.stringify(parsed.error.format(), null, 2)
        }`,
      );
    }

    await cache.set(modelTitle, parsed.data);
    return parsed.data;
  } catch (error) {
    throw new Error(`Error fetching app manifest: ${error}`);
  }
}
