import { Handlers, PageProps } from "$fresh/server.ts";
import { EndNodeCard } from "../components/EndNodeCard.tsx";
import * as cl from "@citylink-edgenode/core";

export const handler: Handlers<cl.ThingDescription[]> = {
  async GET(_req, ctx) {
    const res = await fetch("http://localhost:8080/things");
    const tds = await res.json();
    return ctx.render(tds);
  },
};

export default function Home({ data }: PageProps<cl.ThingDescription[]>) {
  return (
    <div class="grid gap-4 p-4">
      {data.map((td) => <EndNodeCard key={td.id} td={td} />)}
    </div>
  );
}
