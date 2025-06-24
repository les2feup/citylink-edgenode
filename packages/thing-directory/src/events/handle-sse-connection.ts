import { createLogger } from "common/log";
import { errorResponse } from "../utils/error-response.ts";
import { eventBus, EventType } from "@citylink-edgenode/core";
const logger = createLogger("TDD", "HandleSseConnection");

/**
 * Handles Server-Sent Events (SSE) connections for Thing Directory events.
 * This is a skeleton and requires a more robust event management system
 * in a full implementation to push real-time events.
 * @param eventType The type of event (e.g., "thingCreated").
 * @param uriVars The URLSearchParams for event-specific parameters (e.g., 'diff').
 * @param req The original Request object to access its signal for abort handling.
 * @returns A Response object for an SSE stream.
 */
export function handleSSEConnection(
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

  logger.debug(
    { eventType, diff: _diff },
    `Handling SSE connection for event type: ${eventType}`,
  );

  if (
    !Object.values(EventType).includes(eventType as EventType)
  ) {
    logger.error(
      { eventType },
      `Invalid event type requested: ${eventType}`,
    );
    return errorResponse(
      `Invalid event type: ${eventType}`,
      400,
    );
  }

  const readableStream = new ReadableStream({
    start: (controller) => {
      eventBus.register(eventType, controller);
      logger.info(
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
