type SSEClient = {
  eventType: string;
  controller: ReadableStreamDefaultController<Uint8Array>;
};

class EventBus {
  private clients: SSEClient[] = [];

  public register(
    eventType: string,
    controller: ReadableStreamDefaultController<Uint8Array>,
  ) {
    this.clients.push({ eventType, controller });
  }

  public unregister(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.clients = this.clients.filter((c) => c.controller !== controller);
  }

  public broadcast(eventType: EventType, data: unknown) {
    const encoder = new TextEncoder();
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    const payload = encoder.encode(message);

    for (const client of this.clients) {
      if (client.eventType === eventType) {
        client.controller.enqueue(payload);
      }
    }
  }

  public thingCreated(tdId: string) {
    this.broadcast(EventType.created, {
      thingID: tdId,
      href: `/things/${tdId}`,
      timestamp: new Date().toISOString(),
    });
  }

  public thingUpdated(tdId: string) {
    this.broadcast(EventType.updated, {
      thingID: tdId,
      href: `/things/${tdId}`,
      timestamp: new Date().toISOString(),
    });
  }

  public thingDeleted(tdId: string) {
    this.broadcast(EventType.deleted, {
      thingID: tdId,
      timestamp: new Date().toISOString(),
    });
  }
}

export enum EventType {
  created = "thingCreated",
  updated = "thingUpdated",
  deleted = "thingDeleted",
}

// Singleton instance
export const eventBus = new EventBus();
