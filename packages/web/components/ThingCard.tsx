import * as cl from "@citylink-edgenode/core";

export function ThingCard({ thing }: { thing: cl.ThingDescription }) {
  return (
    <a
      href={`/things/${thing.id}`}
      class="block p-4 rounded-xl shadow hover:shadow-lg border border-gray-200"
    >
      <h2 class="text-xl font-semibold">{thing.title} | {thing.id}</h2>
      <p class="text-gray-500 text-sm">
        Type: [ {Array.isArray(thing["@type"])
          ? thing["@type"].join(" | ")
          : thing["@type"]} ]
      </p>
    </a>
  );
}
