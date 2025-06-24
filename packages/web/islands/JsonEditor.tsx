// islands/JsonEditorIsland.tsx

import { useEffect, useState } from "preact/hooks";

type Props = {
  data: unknown;
  onSubmit: (data: unknown) => void;
};

type JsonViewEvent = {
  updated_src: unknown;
};

export default function JsonEditor({ data, onSubmit }: Props) {
  // deno-lint-ignore no-explicit-any
  const [ReactJson, setReactJson] = useState<any>(null);
  const [editedJson, setEditedJson] = useState<unknown>(data);

  useEffect(() => {
    import(
      "https://esm.sh/react-json-view@1.21.3?alias=react:preact/compat&external=preact/compat"
    )
      .then((mod) => setReactJson(() => mod.default))
      .catch((err) => console.error("Failed to load JSON editor", err));
  }, []);

  if (!ReactJson) {
    return <div class="text-center p-4">Loading JSON Editor...</div>;
  }

  return (
    <div class="space-y-4">
      <ReactJson
        src={editedJson}
        name={false}
        collapsed={false}
        enableClipboard
        displayDataTypes={false}
        onEdit={(edit: JsonViewEvent) => setEditedJson(edit.updated_src)}
        onAdd={(add: JsonViewEvent) => setEditedJson(add.updated_src)}
        onDelete={(del: JsonViewEvent) => setEditedJson(del.updated_src)}
      />

      <button
        type="button"
        class="px-4 py-2 bg-blue-600 text-white rounded shadow"
        onClick={() => onSubmit(editedJson)}
      >
        Submit Thing Model
      </button>
    </div>
  );
}
