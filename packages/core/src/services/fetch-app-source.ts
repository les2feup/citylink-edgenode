import { createHash } from "node:crypto";
import { getAppContentCache } from "./cache-registry.ts";
import type {
  AppFetchError,
  AppFetchResult,
  SourceFile,
} from "../types/app-source.ts";
import type {
  AppContentTypes,
  Manifest,
  ManifestDownloadItem,
} from "../types/zod/app-manifest.ts";

export async function fetchAppSource(
  manifest: Manifest,
): Promise<AppFetchResult[]> {
  const fetchPromises = (() => {
    switch (manifest.type) {
      case "App":
      case "EmbeddedCore":
        return manifest.source.map((item) => fetchSingleFile(item));
      case "Full": {
        const coreFetches = manifest.source.core.map((item) =>
          fetchSingleFile(item)
        );
        const appFetches = manifest.source.app.map((item) =>
          fetchSingleFile(item)
        );
        return [...coreFetches, ...appFetches];
      }
    }
  })();

  return await Promise.all(fetchPromises);
}

async function fetchSingleFile(
  dl: ManifestDownloadItem,
): Promise<SourceFile | AppFetchError> {
  // before fetching, try the file cache
  const cache = getAppContentCache();
  const cachedFile = cache.get(dl.url);
  if (cachedFile) {
    return { path: dl.filename, url: dl.url, content: cachedFile };
  }

  try {
    const response = await fetch(dl.url);
    if (!response.ok) {
      return {
        url: dl.url,
        error: new Error(`Failed to fetch file: ${response.statusText}`),
      };
    }

    let content: AppContentTypes;
    let hashable: Uint8Array;
    switch (dl.contentType) {
      case "json": {
        content = await response.json();
        hashable = new TextEncoder().encode(JSON.stringify(content));
        break;
      }
      case "text": {
        content = await response.text();
        hashable = new TextEncoder().encode(content);
        break;
      }
      case "binary": {
        content = await response.bytes();
        hashable = content as Uint8Array;
        break;
      }

      default: {
        return {
          url: dl.url,
          error: new Error(`Unsupported content type: ${dl.contentType}`),
        };
      }
    }

    const sha256 = createHash("sha256");
    sha256.update(hashable);
    const digested = sha256.digest("hex");
    if (digested !== dl.sha256) {
      return {
        url: dl.url,
        error: new Error(
          `SHA256 mismatch for ${dl.filename}: expected ${dl.sha256}, got ${digested}`,
        ),
      };
    }

    cache.set(dl.url, content);
    return { path: dl.filename, url: dl.url, content };
  } catch (error) {
    return {
      url: dl.url,
      error: new Error(`Error fetching file: ${error}`),
    };
  }
}

export function filterSourceFetchErrors(
  results: AppFetchResult[],
): AppFetchError[] {
  return results.filter((result): result is AppFetchError =>
    "url" in result && "error" in result
  );
}

export function filterSourceFetchSuccess(
  results: AppFetchResult[],
): SourceFile[] {
  return results.filter((result): result is SourceFile =>
    "path" in result && "url" in result && "content" in result
  );
}
