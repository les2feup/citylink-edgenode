// islands/AdaptationForm.tsx

import { useState } from "preact/hooks";
import JsonEditor from "./JsonEditor.tsx";

type Props = {
  nodeID: string;
};

export default function AdaptationForm({ nodeID }: Props) {
  const [mode, setMode] = useState<"url" | "json">("url");
  const [url, setUrl] = useState("");
  const [fetchedJson, setFetchedJson] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  async function handleFetchFromUrl() {
    setError(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch Thing Model");
      const json = await res.json();
      setFetchedJson(json);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(String(err));
      }
    }
  }

  async function handleSubmitJson(data: unknown) {
    setNotification(null); // clear previous messages

    try {
      const res = await fetch(`http://localhost:8080/adaptation/${nodeID}`, {
        method: "POST",
        body: typeof data === "string" ? data : JSON.stringify(data),
      });

      const text = await res.text();

      if (res.ok) {
        setNotification({ type: "success", message: text });
      } else {
        setNotification({
          type: "error",
          message: `Error ${res.status}: ${text}`,
        });
      }
    } catch (err) {
      setNotification({
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div class="space-y-6">
      <div>
        <label class="block mb-2 font-semibold">Select input mode:</label>
        <div class="inline-flex rounded overflow-hidden border">
          <button
            type="button"
            class={`px-4 py-2 ${
              mode === "url" ? "bg-blue-500 text-white" : "bg-white"
            }`}
            onClick={() => setMode("url")}
          >
            URL
          </button>
          <button
            type="button"
            class={`px-4 py-2 ${
              mode === "json" ? "bg-blue-500 text-white" : "bg-white"
            }`}
            onClick={() => setMode("json")}
          >
            JSON
          </button>
        </div>
      </div>

      {notification && (
        <div
          class={`p-3 rounded text-sm ${
            notification.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {notification.message}
        </div>
      )}

      {mode === "url" && (
        <div class="space-y-4">
          <input
            type="text"
            placeholder="Enter Thing Model URL"
            class="w-full p-2 border rounded"
            value={url}
            onInput={(e) => setUrl(e.currentTarget.value)}
          />
          <button
            type="button"
            class="bg-green-600 text-white px-4 py-2 rounded"
            onClick={handleFetchFromUrl}
          >
            Fetch & Preview
          </button>
          {error && <p class="text-red-600">{error}</p>}
          {fetchedJson && (
            <div>
              <JsonEditor
                data={fetchedJson}
                onSubmit={(data) => handleSubmitJson(data)}
              />
            </div>
          )}
        </div>
      )}

      {mode === "json" && (
        <JsonEditor
          data={{}}
          onSubmit={(data) => handleSubmitJson(data)}
        />
      )}

      {notification && (
        <div
          class={`p-3 rounded text-sm ${
            notification.type === "success"
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          {notification.message}
        </div>
      )}
    </div>
  );
}
