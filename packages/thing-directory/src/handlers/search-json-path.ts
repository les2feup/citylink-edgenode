import { JSONPath } from "jsr:@stdext/json";
import { createLogger } from "common/log";
import type { JsonValue } from "jsr:@std/json@^1/types";
import { errorResponse } from "../utils/error-response.ts";
import type { EdgeConnector } from "@citylink-edgenode/core";

const logger = createLogger("TDD", "SearchJSONPath");

/**
 * Skeleton for the JSONPath search action (GET /search/jsonpath?query={query}).
 * @param uriVars The URLSearchParams containing the 'query' variable.
 * @returns A Response containing search results or an error.
 */
export function searchJSONPath(
  connectors: EdgeConnector[],
  uriVars: URLSearchParams,
): Response {
  const query = uriVars.get("query");
  logger.debug({ query }, "Executing JSONPath search");

  if (!query) {
    return errorResponse("JSONPath expression not provided.", 400);
  }

  try {
    const allThings = connectors.flatMap(
      (ec) => ec.getRegisteredNodes().map((n) => n.thingDescription),
    );

    const results = allThings.flatMap((td) => {
      const jp = new JSONPath(td as JsonValue);
      const matches = jp.query(query);
      return matches.length > 0
        ? [
          { thingId: td.id, href: `/things/${td.id}`, matches },
        ]
        : [];
    });

    return new Response(JSON.stringify({ query, results }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    logger.error(err, "JSONPath search failed");
    return errorResponse(
      `JSONPath search failed: ${err instanceof Error ? err.message : err}`,
      500,
    );
  }
}
