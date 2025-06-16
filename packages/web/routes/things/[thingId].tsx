import { Handlers, PageProps } from "$fresh/server.ts";
import JsonViewer from "../../islands/JsonViewer.tsx";
import { createGetHandler } from "../../utils/get-handler.ts";

export const handler: Handlers = createGetHandler(
  (ctx) => `http://localhost:8080/things/${ctx.params.thingId}`,
);

export default function ThingDescriptionDetails(
  { data }: PageProps,
) {
  return <JsonViewer data={data} />;
}
