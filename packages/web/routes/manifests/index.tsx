import { Handlers, PageProps } from "$fresh/server.ts";
import { createGetHandler } from "../../utils/get-handler.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";

export const handler: Handlers = createGetHandler((ctx) => {
  const url = new URL(ctx.url);
  const offset = url.searchParams.get("offset") ?? "0";
  const limit = url.searchParams.get("limit") ?? "10";
  return `http://localhost:8080/manifests?offset=${offset}&limit=${limit}`;
});

export default function AllManifests({ data, url }: PageProps) {
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "10");

  const newOffsetUrl = (delta: number) =>
    `/manifests?offset=${Math.max(offset + delta, 0)}&limit=${limit}`;

  return (
    <div class="space-y-4">
      <h1 class="text-2xl font-semibold">All Thing Models</h1>

      <form method="GET" action="/manifests" class="space-x-2">
        <label>
          Limit:
          <input
            type="number"
            name="limit"
            min="1"
            value={limit}
            class="ml-2 px-2 py-1 border rounded"
          />
        </label>
        <input type="hidden" name="offset" value="0" />
        <button type="submit" class="px-3 py-1 bg-blue-600 text-white rounded">
          Apply
        </button>
      </form>

      <div class="flex justify-between">
        <a
          href={newOffsetUrl(-limit)}
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
        >
          Previous
        </a>
        <a
          href={newOffsetUrl(limit)}
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
        >
          Next
        </a>
      </div>

      <JsonViewer data={data} collapsed={2} />
    </div>
  );
}
