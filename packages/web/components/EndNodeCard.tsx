import * as cl from "@citylink-edgenode/core";

export function EndNodeCard({ td }: { td: cl.ThingDescription }) {
  return (
    <div class="p-4 rounded-xl shadow hover:shadow-lg border border-gray-200">
      <h2 class="text-xl font-semibold">{td.title}</h2>
      <h3 class="text-gray-700 text-sm mb-4">{td.id}</h3>
      <div class="flex flex-wrap gap-2">
        <a
          href={`/things/${td.id}`}
          class="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Thing Description
        </a>
        <a
          href={`/thing-models/${td.title}`}
          class="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
        >
          Thing Model
        </a>
        <a
          href={`/manifests/${td.title}`}
          class="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Manifest
        </a>
      </div>
    </div>
  );
}
