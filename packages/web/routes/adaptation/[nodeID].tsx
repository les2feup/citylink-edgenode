import { defineRoute } from "$fresh/server.ts";
import AdaptationPage from "../../islands/AdaptationPage.tsx";

export default defineRoute((_req, ctx) => {
  const nodeID = ctx.params.nodeID;
  const modelTitle = ctx.url.searchParams.get("title") ?? "unknown";

  return <AdaptationPage nodeID={nodeID} modelTitle={modelTitle} />;
});

