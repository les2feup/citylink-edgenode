import { Handlers, PageProps } from "$fresh/server.ts";
import { createGetHandler } from "../../utils/get-handler.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import PaginationControls from "../../components/PaginationControls.tsx";

export const handler: Handlers = createGetHandler((ctx) => {
  const url = new URL(ctx.url);
  const offset = url.searchParams.get("offset") ?? "0";
  const limit = url.searchParams.get("limit") ?? "10";
  return `http://localhost:8080/thing-models?offset=${offset}&limit=${limit}`;
});

export default function AllThingModels({ data, url }: PageProps) {
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "10");
  const { data: thingModels, headers } = data;

  return (
    <div class="space-y-6">
      <h1 class="text-2xl font-semibold">All Thing Models</h1>
      <PaginationControls
        basePath="/thing-models"
        offset={offset}
        limit={limit}
        headers={headers}
      />
      <JsonViewer data={thingModels} collapsed={2} />
    </div>
  );
}
