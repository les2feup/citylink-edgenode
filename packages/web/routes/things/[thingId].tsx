import { defineRoute } from "$fresh/server.ts";
import { fetchResource } from "../../utils/fetch-resource.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import * as cl from "@citylink-edgenode/core";

export default defineRoute(async (_req, ctx) => {
  //TODO: add a ThingDescription validation function
  const thing = await fetchResource<cl.ThingDescription>(
    `http://localhost:8080/things/${ctx.params.thingId}`,
    (res) => res.json(),
  );

  return <JsonViewer data={thing} collapsed={2} />;
});
