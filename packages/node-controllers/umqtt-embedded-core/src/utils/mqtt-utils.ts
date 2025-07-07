import type { ThingDescription } from "@citylink-edgenode/core";

export type MqttBindingOptions = {
  href: string;
  topic: string;
  qos?: 0 | 1 | 2;
  retain?: boolean;
};

export function extractMqttBindings(
  forms: ThingDescription["forms"],
  affordanceType: "property" | "event" | "action",
  expectedOp: string,
): MqttBindingOptions | null {
  const topicKey = (() => {
    switch (affordanceType) {
      case "property":
      case "event":
        return "mqv:filter";
      case "action":
        return "mqv:topic";
    }
  })();

  if (!forms || !forms.length) return null;

  for (const form of forms) {
    const ops = Array.isArray(form.op) ? form.op : [form.op];
    if (!ops.includes(expectedOp)) continue;

    const topic = form[topicKey] as string | undefined;
    const href = form.href;
    if (!topic || !href) continue;

    return {
      href,
      topic,
      qos: form["mqv:qos"] as 0 | 1 | 2 | undefined,
      retain: form["mqv:retain"] as boolean | undefined,
    };
  }

  return null;
}

export function parseTopic(
  expectedPrefix: string,
  topic: string,
): { type: string; namespace: string; name: string } | null {
  if (!topic.startsWith(expectedPrefix)) {
    return null;
  }

  const affordance = topic.slice(expectedPrefix.length);
  const [type, namespace, ...nameParts] = affordance.split("/");
  if (!type || !namespace || nameParts.length === 0) {
    return null;
  }

  if (!["properties", "events", "actions"].includes(type)) {
    return null;
  }

  return { type, namespace, name: nameParts.join("/") };
}

export function defaultPublishPromises(
  td: ThingDescription,
  publisher: (
    topic: string,
    payload: unknown,
    qos?: 0 | 1 | 2,
    retain?: boolean,
  ) => Promise<void>,
) {
  const promises: Promise<void>[] = [];

  const properties = td.properties ?? {};
  for (const [_, prop] of Object.entries(properties)) {
    const value = prop.const ?? prop.default ?? null;
    if (value === null) continue;

    const opts = extractMqttBindings(prop.forms, "property", "readproperty");
    if (opts) {
      promises.push(
        publisher(
          opts.topic,
          value,
          opts.qos,
          opts.retain,
        ),
      );
    }
  }

  return promises;
}

export function subcriptionPromises(
  td: ThingDescription,
  type: "property" | "event",
  op: string,
  subscriber: (topic: string, qos: 0 | 1 | 2) => Promise<void>,
): Promise<void>[] {
  const promises: Promise<void>[] = [];
  const opts = extractMqttBindings(td.forms, type, op);
  if (opts) promises.push(subscriber(opts.topic, opts.qos ?? 0));

  return promises;
}
