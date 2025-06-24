import AdaptationForm from "../../islands/AdaptationForm.tsx";
import { defineRoute } from "$fresh/server.ts";

export default defineRoute((_req, ctx) => {
  const nodeID = ctx.params.nodeID;
  const modelTitle = ctx.url.searchParams.get("title") ?? "unknown";
  return (
    <div class="max-w-3xl mx-auto p-6">
      <h1 class="text-2xl font-bold mb-4">Adapt End Node</h1>
      <div>
        End Node ID: <span class="font-semibold">{nodeID}</span>
      </div>
      <div>
        Current Model:{" "}
        <span class="font-semibold">{decodeURIComponent(modelTitle)}</span>
      </div>
      <AdaptationForm nodeID={nodeID} />
    </div>
  );
});
