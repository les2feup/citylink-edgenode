import { Handlers, PageProps } from "$fresh/server.ts";
import { createGetHandler } from "../../utils/get-handler.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";

export const handler: Handlers = createGetHandler(
  (ctx) => `http://localhost:8080/manifests/${ctx.params.modelTitle}`,
);

export default function ManifestDetails(
  { data }: PageProps,
) {
  const { data: manifestData } = data;
  return <JsonViewer data={manifestData} collapsed={3} />;
}
