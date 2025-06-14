import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "../components/Layout.tsx";
import { ThingCard } from "../components/ThingCard.tsx";
import * as cl from "@citylink-edgenode/core";

export const handler: Handlers<cl.ThingDescription[]> = {
  async GET(_req, ctx) {
    const res = await fetch("http://localhost:8080/things");
    const things = await res.json();
    return ctx.render(things);
  },
};

export default function Home({ data }: PageProps<cl.ThingDescription[]>) {
  return (
    <Layout title="CityLink TDD">
      <div class="grid gap-4 p-4">
        {data.map((thing) => <ThingCard key={thing.id} thing={thing} />)}
      </div>
    </Layout>
  );
}
