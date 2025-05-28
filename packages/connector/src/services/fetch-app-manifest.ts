import { AppManifest } from "../types/zod/app-manifest.ts";
import { getAppManifestCache } from "./cache-registry.ts";

export async function fetchAppManifest(
  url: URL,
): Promise<AppManifest> {
  const cache = getAppManifestCache();

  try {
    const cachedManifest = await cache.get(url.toString());
    if (cachedManifest) {
      return cachedManifest;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch app manifest: ${response.statusText}`);
    }
    const json = await response.json();
    const parsed = AppManifest.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `Invalid app manifest: ${
          JSON.stringify(parsed.error.format(), null, 2)
        }`,
      );
    }

    await cache.set(url.toString(), parsed.data);
    return parsed.data;
  } catch (error) {
    throw new Error(`Error fetching app manifest: ${error}`);
  }
}
