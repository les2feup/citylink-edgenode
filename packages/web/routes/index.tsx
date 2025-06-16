import { defineRoute } from "$fresh/server.ts";
import { fetchResource } from "../utils/fetch-resource.ts";
import { EndNodeCard } from "../components/EndNodeCard.tsx";
import * as cl from "@citylink-edgenode/core";

export default defineRoute(async (_req, _ctx) => {
  //TODO: progressively load things as the user scrolls
  const endpoint = "http://localhost:8080/things";
  const things = await fetchResource<cl.ThingDescription[]>(
    endpoint,
    (res) => res.json(),
  );

  if (!Array.isArray(things)) {
    console.error("Expected an array of Thing Descriptions", things);
    return <div>404: Error loading things</div>;
  }

  return (
    <div class="grid gap-4 p-4">
      {things.map((td) => <EndNodeCard key={td.id} td={td} />)}
    </div>
  );
});
