import { Handlers, PageProps } from "$fresh/server.ts";
import { createGetHandler } from "../../utils/get-handler.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import PaginationControls from "../../components/PaginationControls.tsx";

export const handler: Handlers = createGetHandler((ctx) => {
  const url = new URL(ctx.url);
  const offset = url.searchParams.get("offset") ?? "0";
  const limit = url.searchParams.get("limit") ?? "10";
  return `http://localhost:8080/manifests?offset=${offset}&limit=${limit}`;
});

export default function AllManifests({ data, url }: PageProps) {
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "10");
  const { data: manifests, headers } = data;

  return (
    <div class="space-y-6">
      <h1 class="text-2xl font-semibold">All Manifests</h1>
      <PaginationControls
        basePath="/manifests"
        offset={offset}
        limit={limit}
        headers={headers}
      />
      <JsonViewer data={manifests} collapsed={3} />
    </div>
  );
}
