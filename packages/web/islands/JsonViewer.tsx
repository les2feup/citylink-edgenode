import { useEffect, useState } from "preact/hooks"; // Keep useState for ReactJson internal state

type Props = {
  data: unknown; // The JSON data to display
  className?: string; // Optional className for styling
  collapsed?: number; // Optional prop to control initial collapse state
};

export default function JsonViewer({ data, className, collapsed }: Props) {
  // deno-lint-ignore no-explicit-any
  const [ReactJson, setReactJson] = useState<any>(null);

  // Effect to update the local signal when the prop signal changes
  useEffect(() => {
    import(
      "https://esm.sh/react-json-view@1.21.3?alias=react:preact/compat&external=preact/compat"
    )
      .then((mod) => setReactJson(() => mod.default))
      .catch((err) => console.error("Failed to load JSON editor", err));
  }, []);

  if (!ReactJson) {
    return (
      <div
        class={`flex items-center justify-center ${
          className || "h-48"
        } bg-gray-50 border border-gray-200 rounded-md`}
      >
        <div class="text-center text-gray-500">Loading JSON Editor...</div>
      </div>
    );
  }

  return (
    <div
      className={`
        p-2 bg-white text-sm whitespace-pre-wrap 
        break-words overflow-auto ${className}
        `}
    >
      <ReactJson
        src={data}
        name={false}
        indentWidth={2}
        enableClipboard
        collapsed={collapsed}
        displayDataTypes={false}
      />
    </div>
  );
}
