import { useEffect, useState } from "preact/hooks";

type Props = {
  title?: string;
  collapsed?: number;
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

export default function JsonViewer({ collapsed, data }: Props) {
  // Dynamic import of react-json-view to avoid server-side rendering issues due to Deno
  // not supporting the "document" global object.
  // deno-lint-ignore no-explicit-any
  const [JsonView, setJsonView] = useState<any>(null);

  useEffect(() => {
    import(
      "https://esm.sh/react-json-view@1.21.3?alias=react:preact/compat&external=preact/compat"
    )
      .then((mod) => setJsonView(() => mod.default))
      .catch((err) => console.error("Failed to load JSON viewer", err));
  }, []);

  if (!JsonView) {
    return (
      <div class="p-8 text-center">
        <h1 class="text-2xl font-semibold">Loading JSON Viewer...</h1>
      </div>
    );
  }

  if (!data || typeof data !== "object") {
    return (
      <div class="p-8 text-center text-red-600">
        <h1 class="text-2xl font-semibold">Not found or failed to load.</h1>
      </div>
    );
  }

  return (
    <div class="p-4 overflow-auto">
      <JsonView src={data} collapsed={collapsed ?? 2} name={false} />
    </div>
  );
}
