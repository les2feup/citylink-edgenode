import { defineRoute } from "$fresh/server.ts";
import { fetchResource } from "../../utils/fetch-resource.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import PaginationControls from "../../components/PaginationControls.tsx";
import * as cl from "@citylink-edgenode/core";

interface Resource {
  enrichedManifests: {
    modelTitle: string;
    modelUrl: string;
    manifest: cl.Manifest;
  }[];
  headers: Headers;
}

export default defineRoute(async (_req, ctx) => {
  const offset = Number(ctx.url.searchParams.get("offset") ?? "0");
  const limit = Number(ctx.url.searchParams.get("limit") ?? "10");
  const endpoint =
    `http://localhost:8080/manifests?offset=${offset}&limit=${limit}`;

  const content = (
    data:
      | { enrichedManifests: Resource["enrichedManifests"]; headers: Headers }
      | null,
  ) => {
    return (
      <div class="space-y-6">
        <h1 class="text-2xl font-semibold">All Manifests</h1>
        {data
          ? (
            <PaginationControls
              basePath="/manifests"
              offset={offset}
              limit={limit}
              headers={data.headers}
            />
          )
          : null}
        <JsonViewer data={data?.enrichedManifests} collapsed={3} />
      </div>
    );
  };

  const res = await fetchResource<Resource | null>(
    endpoint,
    async (r) => {
      const rawArray = await r.json() as Resource["enrichedManifests"];
      if (!Array.isArray(rawArray)) {
        console.error("Expected an array from the API", rawArray);
        return null;
      }

      const data = rawArray.map((item) => {
        const result = cl.Manifest.safeParse(item.manifest);
        if (!result.success) {
          console.error("Failed to parse manifest data", {
            error: result.error,
            data: item,
          });
          return null;
        }
        return item;
      }).filter((item) => item !== null) as Resource["enrichedManifests"];

      if (data.length === 0) {
        console.warn("No valid manifests found in the response");
        return null;
      }

      return { enrichedManifests: data, headers: r.headers };
    },
  );

  if (!res) return content(null);

  return content({
    enrichedManifests: res.enrichedManifests,
    headers: res.headers,
  });
});
