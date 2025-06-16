import { Handlers, PageProps } from "$fresh/server.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import { createGetHandler } from "../../utils/get-handler.ts";

export const handler: Handlers = createGetHandler(
  (ctx) => `http://localhost:8080/thing-models/${ctx.params.title}`,
);

export default function ThingModelDetails(
  { data }: PageProps,
) {
  const { data: thingModelData } = data;
  return <JsonViewer data={thingModelData} />;
}
