import { defineRoute } from "$fresh/server.ts";
import { fetchResource } from "../../utils/fetch-resource.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import PaginationControls from "../../components/PaginationControls.tsx";
import { isValidThingModel, type ThingModel } from "@citylink-edgenode/core";

interface Resource {
  thingModels: ThingModel[];
  headers: Headers;
}

export default defineRoute(async (_req, ctx) => {
  const offset = Number(ctx.url.searchParams.get("offset") ?? "0");
  const limit = Number(ctx.url.searchParams.get("limit") ?? "10");
  const endpoint =
    `http://localhost:8080/thing-models?offset=${offset}&limit=${limit}`;

  const content = (
    data: { thingModels: ThingModel[]; headers: Headers } | null,
  ) => {
    return (
      <div class="space-y-6">
        <h1 class="text-2xl font-semibold">All Thing Models</h1>
        {data
          ? (
            <PaginationControls
              basePath="/thing-models"
              offset={offset}
              limit={limit}
              headers={data.headers}
            />
          )
          : null}
        <JsonViewer data={data?.thingModels} collapsed={2} />
      </div>
    );
  };

  const res = await fetchResource<Resource | null>(
    endpoint,
    async (r) => {
      const rawArray = await r.json();
      if (!Array.isArray(rawArray)) {
        console.error("Expected an array from the API", rawArray);
        return null;
      }

      const thingModels: ThingModel[] = rawArray.filter((item) => {
        if (!isValidThingModel(item)) {
          console.error("Invalid Thing Model data", { item });
          return false;
        }
        return true;
      });

      if (thingModels.length === 0) {
        console.warn("No valid Thing Models found in the response");
        return null;
      }

      return { thingModels, headers: r.headers };
    },
  );

  if (!res) return content(null);
  return content({ thingModels: res.thingModels, headers: res.headers });
});
