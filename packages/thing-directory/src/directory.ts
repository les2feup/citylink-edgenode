import type * as cl from "@citylink-edgc/core"; // Assuming this type definition is available
import { createLogger } from "common/log"; // Assuming this utility is available

/**
 * ThingDirectory class manages EdgeConnectors and provides API endpoints
 * for discovering and retrieving Thing Descriptions.
 */
export class ThingDirectory {
  // Array to store instances of connected EdgeConnectors.
  private connectorInstances: cl.EdgeConnector[] = [];
  // Logger instance for logging messages within the class.
  private logger = createLogger("thing-directory", "main");

  constructor() {
    // Constructor for the ThingDirectory. No specific initialization logic needed here currently.
  }

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
    // In a full implementation, this is where you'd trigger a 'thingCreated' event
    // this.emitThingCreated(ec.getRegisteredNodes().map(n => n.thingDescription));
  }

  /**
   * Starts the Deno HTTP server to serve Thing Directory API requests.
   * @param baseUrl The base URL for the server (defaults to "http://localhost:8080").
   * @returns A Promise that resolves when the server starts.
   */
  start(baseUrl: string = "http://localhost:8080"): void {
    this.logger.info(`Starting ThingDirectory on ${baseUrl}`);

    // Deno.serve creates an HTTP server.
    // It listens on the specified port (8080 in this case).
    Deno.serve({ port: 8080 }, (req: Request): Response => {
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

        // If no matching route is found, return a 404 Not Found response.
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
        "@next": `/things?offset=${endIndex}&limit=${limit}&format=collection`,
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
        if (node.id === thingId) {
          this.logger.debug({ thingId, node }, "Retrieved Thing");
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

    // --- Placeholder for actual JSONPath search logic ---
    // In a real implementation, you would:
    // 1. Parse the JSONPath query.
    // 2. Iterate through all registered Thing Descriptions.
    // 3. Apply the JSONPath query to each Thing Description.
    // 4. Aggregate the results.
    // Deno doesn't have a built-in JSONPath engine, you'd need an external library.
    const mockSearchResults = {
      message:
        `JSONPath search for query: "${query}" (actual search logic not implemented yet)`,
      results: [], // Placeholder for actual results
    };

    return new Response(JSON.stringify(mockSearchResults), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
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
    const diff = uriVars.get("diff") === "true";
    this.logger.info(`New SSE connection for ${eventType} (diff=${diff})`);

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      start: (controller) => {
        // Send initial connection message
        controller.enqueue(
          encoder.encode(
            `event: connected\ndata: Connected to ${eventType} event stream.\n\n`,
          ),
        );

        // In a real application, you'd subscribe this connection to an internal
        // event bus that pushes actual Thing created/updated/deleted events.
        // For this skeleton, we'll send a periodic mock event.
        let eventId = 0;
        const intervalId = setInterval(() => {
          eventId++;
          const data = {
            id: `mock-thing-${eventId}`,
            description: `A mock thing ${eventType} event`,
            timestamp: new Date().toISOString(),
            diff: diff, // Reflects the 'diff' parameter
          };
          const eventMessage = `id: ${eventId}\nevent: ${eventType}\ndata: ${
            JSON.stringify(data)
          }\n\n`;
          controller.enqueue(encoder.encode(eventMessage));
        }, 5000); // Send a mock event every 5 seconds

        // Clean up when the client disconnects or stream is closed
        req.signal.addEventListener("abort", () => {
          clearInterval(intervalId);
          controller.close();
          this.logger.info(`SSE connection for ${eventType} aborted.`);
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

