import { defineRoute } from "$fresh/server.ts";
import { fetchResource } from "../../utils/fetch-resource.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import * as cl from "@citylink-edgenode/core";

function parseManifest(data: unknown) {
  if (!data) {
    return null;
  }

  const result = cl.Manifest.safeParse(data);
  if (!result.success) {
    console.error("Failed to parse manifest data", {
      error: result.error,
      data,
    });
    return null;
  }
  return result;
}

export default defineRoute(async (_req, ctx) => {
  const endpoint = `http://localhost:8080/manifests/${ctx.params.modelTitle}`;
  const rawData = await fetchResource<JSON>(endpoint, (res) => res.json());
  const manifest = parseManifest(rawData);
  if (!manifest) {
    return <JsonViewer data={null} />;
  }

  return <JsonViewer data={manifest} collapsed={3} />;
});
