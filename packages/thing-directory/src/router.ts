import type { EdgeConnector } from "@citylink-edgenode/core";
import { createLogger } from "common/log";
import { listThings } from "./handlers/list-things.ts";
import { listThingModels } from "./handlers/list-thing-models.ts";
import { listManifests } from "./handlers/list-manifests.ts";
import { retrieveThing } from "./handlers/retrieve-thing.ts";
import { retrieveThingModel } from "./handlers/retrieve-thing-model.ts";
import { retrieveManifest } from "./handlers/retrieve-manifest.ts";
import { startAdaptation } from "./handlers/start-adaptation.ts";
import { searchJSONPath } from "./handlers/search-json-path.ts";
import { handleSSEConnection } from "./events/handle-sse-connection.ts";

const logger = createLogger("TDD", "Router");

export async function handleRequest(
  req: Request,
  connectors: EdgeConnector[],
): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname.replace(/\/$/, ""); // Remove trailing slash for consistency
  const method = req.method;
  logger.debug(
    { method, url, pathname, searchParams: url.searchParams },
    "Received request",
  );

  // --- /things property (GET /things{?offset,limit,format}) ---
  if (method === "GET" && pathname === "/things") {
    return listThings(connectors, url.searchParams);
  }

  // --- /thing-models property (GET /thing-models{?offset,limit}) ---
  if (method === "GET" && pathname === "/thing-models") {
    return await listThingModels(url.searchParams);
  }

  // --- /manifests property (GET /manifests{?offset,limit}) ---
  if (method === "GET" && pathname === "/manifests") {
    return await listManifests(url);
  }

  // --- /actions/retrieveThing (GET /things/{id}) ---
  // Using a regex to match /things/{id} paths
  const retrieveThingMatch = pathname.match(/^\/things\/(.+)$/);
  if (method === "GET" && retrieveThingMatch) {
    const thingId = retrieveThingMatch[1]; // Extract ID from path
    return retrieveThing(connectors, thingId);
  }

  // --- /actions/retrieveThingModel (GET /thing-models/{title}) ---
  // Using a regex to match /thing-models/{title} paths
  // This assumes title is a unique identifier for Thing Models.
  const retrieveThingModelMatch = pathname.match(
    /^\/thing-models\/(.+)$/,
  );
  if (method === "GET" && retrieveThingModelMatch) {
    return await retrieveThingModel(retrieveThingModelMatch[1]);
  }

  // --- /actions/retrieveThingModel (GET /thing-models/{title}) ---
  // Using a regex to match /thing-models/{title} paths
  // This assumes title is a unique identifier for Thing Models.
  const retrieveManifestMatch = pathname.match(
    /^\/manifests\/(.+)$/,
  );
  if (method === "GET" && retrieveManifestMatch) {
    return await retrieveManifest(retrieveManifestMatch[1]);
  }

  // --- /actions/adaptEndNode (POST /adaptation/{id}) ---
  // Using a regex to match /adaptation/{id} paths
  const adaptationMatch = pathname.match(/^\/adaptation\/(.+)$/);
  if (method === "POST" && adaptationMatch) {
    const thingId = adaptationMatch[1]; // Extract ID from path
    const body = await req.text(); // body should be a URL or Thing model
    const bodyisUrl = URL.canParse(body);
    const parsedBody = bodyisUrl ? new URL(body) : JSON.parse(body);
    return await startAdaptation(connectors, thingId, parsedBody);
  }

  // --- /actions/searchJSONPath (GET /search/jsonpath?query={query}) ---
  if (method === "GET" && pathname === "/search/jsonpath") {
    return searchJSONPath(connectors, url.searchParams);
  }

  // --- /events (GET /events{?diff}) ---
  if (method === "GET" && pathname === "/events") {
    return handleSSEConnection(
      "allEvents",
      url.searchParams,
      req,
    );
  }

  // --- /events/thingCreated (GET /events/thing_created{?diff}) ---
  if (method === "GET" && pathname === "/events/thing_created") {
    return handleSSEConnection(
      "thingCreated",
      url.searchParams,
      req,
    );
  }

  // --- /events/thingUpdated (GET /events/thing_updated{?diff}) ---
  if (method === "GET" && pathname === "/events/thing_updated") {
    return handleSSEConnection(
      "thingUpdated",
      url.searchParams,
      req,
    );
  }

  // --- /events/thingDeleted (GET /events/thing_deleted) ---
  if (method === "GET" && pathname === "/events/thing_deleted") {
    return handleSSEConnection(
      "thingDeleted",
      url.searchParams,
      req,
    );
  }

  return new Response("Not Found", { status: 404 });
}
