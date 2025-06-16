import { JSONPath } from "jsr:@stdext/json";
import * as cl from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import type { JsonValue } from "jsr:@std/json@^1/types";

type EnrichedManifest = {
  modelTitle: string;
  modelUrl: URL;
  manifest: cl.Manifest;
};

/**
 * ThingDirectory class manages EdgeConnectors and provides API endpoints
 * for discovering and retrieving Thing Descriptions.
 */
export class ThingDirectory {
  // Array to store instances of connected EdgeConnectors.
  private connectorInstances: cl.EdgeConnector[] = [];
  // Logger instance for logging messages within the class.
  private logger = createLogger("TDD", "main");

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
   * @param baseUrl The base URL for the server (defaults to "http://localhost:8080").
   */
  start(hostname: string = "localhost", port: number = 8080): void {
    this.logger.info(
      { ip: hostname, port },
      "Starting ThingDirectory",
    );

    // Deno.serve creates an HTTP server.
    Deno.serve({ hostname, port }, async (req: Request): Promise<Response> => {
      try {
        const url = new URL(req.url);
        const pathname = url.pathname.replace(/\/$/, ""); // Remove trailing slash for consistency
        const method = req.method;
        this.logger.debug(
          { method, url, pathname, searchParams: url.searchParams },
          "Received request",
        );

        // --- /things property (GET /things{?offset,limit,format}) ---
        if (method === "GET" && pathname === "/things") {
          return this.listThings(url.searchParams);
        }

        // --- /thing-models property (GET /thing-models{?offset,limit}) ---
        if (method === "GET" && pathname === "/thing-models") {
          return await this.listThingModels(url.searchParams);
        }

        // --- /manifests property (GET /manifests{?offset,limit}) ---
        if (method === "GET" && pathname === "/manifests") {
          return await this.listManifests(url);
        }

        // --- /actions/retrieveThing (GET /things/{id}) ---
        // Using a regex to match /things/{id} paths
        const retrieveThingMatch = pathname.match(/^\/things\/(.+)$/);
        if (method === "GET" && retrieveThingMatch) {
          const thingId = retrieveThingMatch[1]; // Extract ID from path
          return this.retrieveThing(thingId);
        }

        // --- /actions/retrieveThingModel (GET /thing-models/{title}) ---
        // Using a regex to match /thing-models/{title} paths
        // This assumes title is a unique identifier for Thing Models.
        const retrieveThingModelMatch = pathname.match(
          /^\/thing-models\/(.+)$/,
        );
        if (method === "GET" && retrieveThingModelMatch) {
          return await this.retrieveThingModel(retrieveThingModelMatch[1]);
        }

        // --- /actions/adaptEndNode (POST /adaptation/{id}) ---
        // Using a regex to match /adaptation/{id} paths
        const adaptationMatch = pathname.match(/^\/adaptation\/(.+)$/);
        if (method === "POST" && adaptationMatch) {
          const thingId = adaptationMatch[1]; // Extract ID from path
          const body = await req.text(); // body should be a URL or Thing model
          const bodyisUrl = URL.canParse(body);
          const parsedBody = bodyisUrl ? new URL(body) : JSON.parse(body);
          return await this.startEndNodeAdaptation(thingId, parsedBody);
        }

        // --- /actions/searchJSONPath (GET /search/jsonpath?query={query}) ---
        if (method === "GET" && pathname === "/search/jsonpath") {
          return this.searchJSONPath(url.searchParams);
        }

        //TODO: --- /events (GET /events) --- subscribe to all events
        if (method === "GET" && pathname === "/events") {
          return this.handleSseConnection(
            "allEvents",
            url.searchParams,
            req,
          );
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

  private handleListRequestOutput(
    data:
      | ReadonlyArray<cl.ThingDescription>
      | ReadonlyArray<cl.ThingModel>
      | ReadonlyArray<EnrichedManifest>,
    urlBase: string,
    uriVars: URLSearchParams,
  ): Response {
    const offset = parseInt(uriVars.get("offset") || "0");
    const limit = parseInt(uriVars.get("limit") || `${data.length}`);
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
    const endIndex = Math.min(startIndex + limit, data.length);

    const paginatedThings = data.slice(startIndex, endIndex);

    let responseBody;

    //TODO: have etag change if the collection changes
    const headers = new Headers();
    headers.append("Link", `<${urlBase}>; rel="cannonical"; etag="v1"`);

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
        headers.append("Link", `<${next}>; rel="next"`);
      }
    } else { // Default or 'array'
      responseBody = paginatedThings;
    }

    return new Response(JSON.stringify(responseBody), {
      headers: {
        "Content-Type": "application/ld+json",
        "Link": links.join(", "),
      },
    });
  }

  /**
   * Implements the logic for the GET /things endpoint.
   * Collects Thing Descriptions from all registered EdgeConnectors, supporting pagination.
   * @param uriVars The URLSearchParams containing 'offset', 'limit', and 'format' variables.
   * @returns A Response containing a JSON array or collection of Thing Descriptions.
   */
  private listThings(uriVars: URLSearchParams): Response {
    this.logger.debug("Listing Things");

    const allThings: cl.ThingDescription[] = this.connectorInstances.flatMap(
      (ec) => ec.getRegisteredNodes().map((n) => n.thingDescription),
    );

    return this.handleListRequestOutput(
      allThings,
      "things",
      uriVars,
    );
  }

  async listThingModels(uriVars: URLSearchParams): Promise<Response> {
    this.logger.debug("Listing Thing Models");

    const allThingModels: Readonly<cl.ThingModel[]> = await cl.CacheService
      .getThingModelCache().getAll();

    return this.handleListRequestOutput(
      allThingModels,
      "thing-models",
      uriVars,
    );
  }

  async listManifests(
    url: URL,
  ): Promise<Response> {
    this.logger.debug("Listing Manifests");

    const allManifestsMap = await cl.CacheService
      .getAppManifestCache().getMap();

    const enrichedManifests: EnrichedManifest[] = Array.from(
      allManifestsMap.entries(),
    ).map(
      ([modelTitle, manifest]) => {
        const base = `${url.protocol}//${url.host}`;
        const modelUrl = new URL(
          `/thing-models/${modelTitle}`,
          base,
        );
        return {
          modelTitle,
          modelUrl,
          manifest,
        };
      },
    );

    return this.handleListRequestOutput(
      enrichedManifests,
      "manifests",
      url.searchParams,
    );
  }

  /**
   * Implements the logic for the GET /things/{id} endpoint (retrieveThing action).
   * Retrieves a specific Thing Description based on the provided ID.
   * @param thingId The ID of the Thing to retrieve from the path.
   * @returns A Response containing the JSON Thing Description, or a 404 if not found.
   */
  private retrieveThing(thingId: string): Response {
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

  async retrieveThingModel(title: string): Promise<Response> {
    this.logger.debug({ title }, "Retrieving Thing Model");

    const allThingModels: Readonly<cl.ThingModel[]> = await cl.CacheService
      .getThingModelCache().getAll();

    const thingModel = allThingModels.find((tm) => tm.title === title);
    if (!thingModel) {
      this.logger.warn({ title }, "Thing Model not found");
      return this.errorResponse(
        `Thing Model with title ${title} not found`,
        404,
      );
    }

    this.logger.debug({ title }, "Retrieved Thing Model");
    return new Response(JSON.stringify(thingModel), {
      headers: { "Content-Type": "application/tm+json" },
    });
  }

  private async startEndNodeAdaptation(
    thingId: string,
    tm: URL | unknown,
  ): Promise<Response> {
    this.logger.debug({ thingId, tm }, "Starting end node adaptation");

    // Validate the Thing ID and Thing Model
    if (!thingId || !tm) {
      return this.errorResponse(
        "Thing ID and Thing Model are required.",
        400,
      );
    }

    // Find the EdgeConnector for the given Thing ID
    const connector = this.connectorInstances.find((ec) =>
      ec.getRegisteredNodes().some((n) =>
        n.thingDescription.id === thingId || n.id === thingId
      )
    );

    if (!connector) {
      return this.errorResponse(
        `Thing ID ${thingId} registered with any EdgeConnector`,
        404,
      );
    }

    // Validate the Thing Model
    if (!(tm instanceof URL) || !cl.utils.isValidThingModel(tm)) {
      return this.errorResponse(
        "Bad request: Invalid input. Not Thing Model or URL.",
        400,
      );
    }

    // Start the adaptation process (this is a placeholder, actual implementation needed)
    try {
      await connector.startNodeAdaptation(thingId, tm);
      return new Response(
        `Adaptation started for Thing ID ${thingId} with model ${tm}`,
        { status: 200 },
      );
    } catch (err) {
      this.logger.error(err, "Failed to start end node adaptation");
      return this.errorResponse(
        `Failed to start adaptation: ${
          err instanceof Error ? err.message : err
        }`,
        500,
      );
    }
  }

  /**
   * Skeleton for the JSONPath search action (GET /search/jsonpath?query={query}).
   * @param uriVars The URLSearchParams containing the 'query' variable.
   * @returns A Response containing search results or an error.
   */
  private searchJSONPath(uriVars: URLSearchParams): Response {
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
    //TODO:
    // - Handle reconnecting clients, sending missed events
    //   - Add IDs to events
    //   - Buffer events in memory or DB, when a client disconnects
    //   - Allow clients to connect with a lastEventID
    //   - Send all events since that ID, for the requested event type
    // - Implement diff logic for event messages
    const _diff = uriVars.get("diff") === "true";
    const encoder = new TextEncoder();

    this.logger.debug(
      { eventType, diff: _diff },
      `Handling SSE connection for event type: ${eventType}`,
    );

    if (
      !Object.values(cl.EventType).includes(eventType as cl.EventType)
    ) {
      this.logger.error(
        { eventType },
        `Invalid event type requested: ${eventType}`,
      );
      return this.errorResponse(
        `Invalid event type: ${eventType}`,
        400,
      );
    }

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
