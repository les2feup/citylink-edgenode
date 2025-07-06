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
