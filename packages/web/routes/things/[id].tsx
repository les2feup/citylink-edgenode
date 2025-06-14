import { Handlers, PageProps } from "$fresh/server.ts";
import { Layout } from "../../components/Layout.tsx";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const id = ctx.params.id;
    const res = await fetch(`http://localhost:8080/things/${id}`);
    const thing = await res.json();
    return ctx.render(thing);
  },
};

export default function ThingDetail({ data }: PageProps) {
  return (
    <Layout title={data.title || "Thing Details"}>
      <pre class="p-4 bg-gray-100 rounded overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </Layout>
  );
}
