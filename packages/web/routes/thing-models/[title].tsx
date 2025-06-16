import { defineRoute } from "$fresh/server.ts";
import { fetchResource } from "../../utils/fetch-resource.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import * as cl from "@citylink-edgenode/core";

export default defineRoute(async (_req, ctx) => {
  const endpoint = `http://localhost:8080/thing-models/${ctx.params.title}`;
  const tm = await fetchResource<JSON>(endpoint, (res) => res.json());
  if (!cl.utils.isValidThingModel(tm)) {
    console.error("Invalid Thing Model data", { tm });
    return <JsonViewer data={null} />;
  }

  return <JsonViewer data={tm} collapsed={3} />;
});
