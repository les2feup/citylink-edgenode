import { JSONPath } from "jsr:@stdext/json";
import * as cl from "@cityling-edgenode/core";
import { createLogger } from "common/log";
import type { JsonValue } from "jsr:@std/json@^1/types";

/**
 * ThingDirectory class manages EdgeConnectors and provides API endpoints
 * for discovering and retrieving Thing Descriptions.
 */
export class ThingDirectory {
  // Array to store instances of connected EdgeConnectors.
  private connectorInstances: cl.EdgeConnector[] = [];
  // Logger instance for logging messages within the class.
  private logger = createLogger("thing-directory", "main");

  constructor() {}

  /**
   * Adds an EdgeConnector instance to the directory.
   * Prevents adding duplicate EdgeConnectors based on their ID.
   * @param ec The EdgeConnector instance to add.
   */
  addEdgeConnector(ec: cl.EdgeConnector) {
    // Check if an EdgeConnector with the same ID already exists.
    if (this.connectorInstances.some((e) => e.id === ec.id)) {
      this.logger.warn(`EdgeConnector with id ${ec.id} already exists.`);
      return;
    }
    // Add the new EdgeConnector to the list.
    this.connectorInstances.push(ec);
  }

  /**
   * Starts the Deno HTTP server to serve Thing Directory API requests.
   * @param baseUrl The base URL for the server (defaults to "http://localhost:8000").
   */
  start(hostname: string = "localhost", port: number = 8000): void {
    this.logger.info(
      { ip: hostname, port },
      "Starting ThingDirectory",
    );

    // Deno.serve creates an HTTP server.
    Deno.serve({ hostname, port }, (req: Request): Response => {
      try {
        const url = new URL(req.url);
        const pathname = url.pathname;
        const method = req.method;

        // --- /things property (GET /things{?offset,limit,format}) ---
        if (method === "GET" && pathname === "/things") {
          return this.readThingsProperty(url.searchParams);
        }

        // --- /actions/retrieveThing (GET /things/{id}) ---
        // Using a regex to match /things/{id} paths
        const retrieveThingMatch = pathname.match(/^\/things\/(.+)$/);
        if (method === "GET" && retrieveThingMatch) {
          const thingId = retrieveThingMatch[1]; // Extract ID from path
          return this.retrieveThingAction(thingId);
        }

        // --- /actions/searchJSONPath (GET /search/jsonpath?query={query}) ---
        if (method === "GET" && pathname === "/search/jsonpath") {
          return this.searchJSONPathAction(url.searchParams);
        }

        // --- /events/thingCreated (GET /events/thing_created{?diff}) ---
        if (method === "GET" && pathname === "/events/thing_created") {
          return this.handleSseConnection(
            "thingCreated",
            url.searchParams,
            req,
          );
        }

        // --- /events/thingUpdated (GET /events/thing_updated{?diff}) ---
        if (method === "GET" && pathname === "/events/thing_updated") {
          return this.handleSseConnection(
            "thingUpdated",
            url.searchParams,
            req,
          );
        }

        // --- /events/thingDeleted (GET /events/thing_deleted) ---
        if (method === "GET" && pathname === "/events/thing_deleted") {
          return this.handleSseConnection(
            "thingDeleted",
            url.searchParams,
            req,
          );
        }

        return new Response("Not Found", { status: 404 });
      } catch (err) {
        // Global error handling for any issues during request processing.
        this.logger.error(err, "Request failed");
        // Return a 500 Internal Server Error with the error message.
        return this.errorResponse(
          `Internal Server Error: ${err instanceof Error ? err.message : err}`,
          500,
        );
      }
    });
  }

  /**
   * Creates a standardized problem+json error response.
   * @param description A human-readable explanation of the error.
   * @param status The HTTP status code for the error.
   * @returns A Response object with application/problem+json content type.
   */
  private errorResponse(description: string, status: number): Response {
    return new Response(description, {
      status,
      headers: { "Content-Type": "application/problem+json" },
    });
  }

  /**
   * Implements the logic for the GET /things endpoint.
   * Collects Thing Descriptions from all registered EdgeConnectors, supporting pagination.
   * @param uriVars The URLSearchParams containing 'offset', 'limit', and 'format' variables.
   * @returns A Response containing a JSON array or collection of Thing Descriptions.
   */
  private readThingsProperty(uriVars: URLSearchParams): Response {
    this.logger.debug("Listing Things");

    const allThings: cl.ThingDescription[] = this.connectorInstances.flatMap(
      (ec) => ec.getRegisteredNodes().map((n) => n.thingDescription),
    );

    const offset = parseInt(uriVars.get("offset") || "0");
    const limit = parseInt(uriVars.get("limit") || `${allThings.length}`);
    const format = uriVars.get("format") || "array"; // Default to 'array'

    this.logger.debug(
      { offset, limit, format },
      "/things Pagination parameters",
    );

    if (isNaN(offset) || offset < 0 || isNaN(limit) || limit < 0) {
      return this.errorResponse(
        "Invalid 'offset' or 'limit' query parameter.",
        400,
      );
    }

    const startIndex = offset;
    const endIndex = Math.min(startIndex + limit, allThings.length);

    const paginatedThings = allThings.slice(startIndex, endIndex);

    let responseBody;
    const contentType = "application/ld+json"; // According to Thing Model specification

    if (format === "collection") {
      // Example of a collection format (adjust as per actual collection spec)
      responseBody = {
        "@context": "https://www.w3.org/2022/wot/discovery", // Example context for collection
        "@type": "ThingCollection",
        "total": allThings.length,
        "members": paginatedThings,
        // Add pagination links if desired, e.g., "next", "prev"
        "@id": `/things?offset=${startIndex}&limit=${limit},&format=collection`,
        "@next": endIndex < allThings.length
          ? `/things?offset=${endIndex}&limit=${limit}&format=collection`
          : null,
        "@prev": startIndex > 0
          ? `/things?offset=${
            Math.max(0, startIndex - limit)
          }&limit=${limit}&format=collection`
          : null,
      };
    } else { // Default or 'array'
      responseBody = paginatedThings;
    }

    return new Response(JSON.stringify(responseBody), {
      headers: { "Content-Type": contentType },
    });
  }

  /**
   * Implements the logic for the GET /things/{id} endpoint (retrieveThing action).
   * Retrieves a specific Thing Description based on the provided ID.
   * @param thingId The ID of the Thing to retrieve from the path.
   * @returns A Response containing the JSON Thing Description, or a 404 if not found.
   */
  private retrieveThingAction(thingId: string): Response {
    this.logger.debug({ thingId }, "Retrieving Thing");

    for (const connector of this.connectorInstances) {
      for (const node of connector.getRegisteredNodes()) {
        if (node.thingDescription.id === thingId || node.id === thingId) {
          this.logger.debug({ thingId }, "Retrieved Thing");
          return new Response(JSON.stringify(node.thingDescription), {
            headers: { "Content-Type": "application/td+json" }, // According to Thing Model specification
          });
        }
      }
    }

    // If the thingId is not found after checking all connectors, return a 404 Not Found.
    return this.errorResponse(`Thing with id ${thingId} not found`, 404);
  }

  /**
   * Skeleton for the JSONPath search action (GET /search/jsonpath?query={query}).
   * @param uriVars The URLSearchParams containing the 'query' variable.
   * @returns A Response containing search results or an error.
   */
  private searchJSONPathAction(uriVars: URLSearchParams): Response {
    const query = uriVars.get("query");
    this.logger.debug({ query }, "Executing JSONPath search");

    if (!query) {
      return this.errorResponse("JSONPath expression not provided.", 400);
    }

    try {
      const allThings: cl.ThingDescription[] = this.connectorInstances.flatMap(
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
      this.logger.error(err, "JSONPath search failed");
      return this.errorResponse(
        `JSONPath search failed: ${err instanceof Error ? err.message : err}`,
        500,
      );
    }
  }

  /**
   * Handles Server-Sent Events (SSE) connections for Thing Directory events.
   * This is a skeleton and requires a more robust event management system
   * in a full implementation to push real-time events.
   * @param eventType The type of event (e.g., "thingCreated").
   * @param uriVars The URLSearchParams for event-specific parameters (e.g., 'diff').
   * @param req The original Request object to access its signal for abort handling.
   * @returns A Response object for an SSE stream.
   */
  private handleSseConnection(
    eventType: string,
    uriVars: URLSearchParams,
    req: Request,
  ): Response {
    const _diff = uriVars.get("diff") === "true";
    const encoder = new TextEncoder();

    const readableStream = new ReadableStream({
      start: (controller) => {
        cl.eventBus.register(eventType, controller);
        this.logger.info(
          { eventType, diff: _diff },
          `Client connected to event stream`,
        );

        controller.enqueue(
          encoder.encode(
            `event: connected\ndata: Connected to ${eventType} event stream.\n\n`,
          ),
        );

        req.signal.addEventListener("abort", () => {
          cl.eventBus.unregister(controller);
          controller.close();
        });
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  }
}
