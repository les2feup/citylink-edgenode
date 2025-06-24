import type { ThingDescription, ThingModel } from "@citylink-edgenode/core";
import type { EnrichedManifest } from "../types.ts";
import { createLogger } from "common/log";
import { errorResponse } from "./error-response.ts";

const logger = createLogger("TDD", "Pagination");

export function handleListRequestOutput(
  data:
    | ReadonlyArray<ThingDescription>
    | ReadonlyArray<ThingModel>
    | ReadonlyArray<EnrichedManifest>,
  urlBase: string,
  uriVars: URLSearchParams,
): Response {
  const offset = parseInt(uriVars.get("offset") || "0");
  const limit = parseInt(uriVars.get("limit") || `${data.length}`);
  const format = uriVars.get("format") || "array"; // Default to 'array'

  logger.debug(
    { offset, limit, format },
    "/things Pagination parameters",
  );

  if (isNaN(offset) || offset < 0 || isNaN(limit) || limit < 0) {
    return errorResponse(
      "Invalid 'offset' or 'limit' query parameter.",
      400,
    );
  }

  const startIndex = offset;
  const endIndex = Math.min(startIndex + limit, data.length);

  const paginatedThings = data.slice(startIndex, endIndex);

  let responseBody;

  //TODO: have etag change if the collection changes
  const headers = new Headers();
  headers.append("Content-Type", "application/ld+json");

  const next = endIndex < data.length
    ? `/${urlBase}?offset=${endIndex}&limit=${limit}`
    : null;

  const prev = startIndex > 0
    ? `/${urlBase}?offset=${Math.max(0, startIndex - limit)}&limit=${limit}`
    : null;

  if (format === "collection" && urlBase === "things") {
    // Example of a collection format (adjust as per actual collection spec)
    responseBody = {
      "@context": "https://www.w3.org/2022/wot/discovery", // Example context for collection
      "@type": "ThingCollection",
      "total": data.length,
      "members": paginatedThings,
      "@id":
        `/${urlBase}?offset=${startIndex}&limit=${limit},&format=collection`,
      "@next": next ? `${next}&format=collection` : null,
      "@prev": prev ? `${prev}&format=collection` : null,
    };

    if (next) {
      headers.append("Link", `<${next}&format=collection>; rel="next"`);
      headers.append(
        "Link",
        `<${urlBase}&format=collection>; rel="cannonical"; etag="v1"`,
      );
    }
  } else { // Default or 'array'
    responseBody = paginatedThings;
    if (next) {
      headers.append("Link", `<${next}>; rel="next"`);
      headers.append("Link", `<${urlBase}>; rel="cannonical"; etag="v1"`);
    }
  }

  return new Response(JSON.stringify(responseBody), { headers });
}
