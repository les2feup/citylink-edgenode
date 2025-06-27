import { useState } from "preact/hooks";
import { fetchResource } from "../utils/fetch-resource.ts";
import { fetchedTM } from "../utils/adaptation-tm-signal.ts";
import JsonViewer from "./JsonViewer.tsx";
import AdaptationFormInputs, {
  notificationType,
} from "./AdaptationFormInputs.tsx";

type Props = {
  nodeID: string;
  modelTitle: string; // Added to display the current model title
};

export default function AdaptationPage({ nodeID, modelTitle }: Props) {
  const [url, setUrl] = useState<string>(""); // Use useState for URL input
  const [notification, setNotification] = useState<
    notificationType | null
  >(null); // Use useSignal for error

  // Helper function for setting notifications
  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
  };

  const handleTMFetch = async () => {
    setNotification(null); // Clear previous notification
    fetchedTM.value = null; // Clear previous TM

    if (!url) {
      showNotification("error", "Please enter a URL to fetch.");
      return;
    }

    try {
      const tm = await fetchResource<JSON>(url, (res) => res.json());
      if (!tm) {
        throw new Error("Thing Model not found at the provided URL.");
      }
      fetchedTM.value = tm;
      showNotification("success", "Thing Model fetched successfully!");
      console.log("Fetched Thing Model:", tm);
    } catch (err) {
      fetchedTM.value = null;
      showNotification(
        "error",
        err instanceof Error
          ? `Failed to fetch: ${err.message}`
          : `An unexpected error occurred during fetch: ${String(err)}`,
      );
    }
  };

  const handleSubmitTM = async () => {
    setNotification(null); // Clear previous notification

    if (!fetchedTM.value) {
      showNotification(
        "error",
        "No Thing Model to submit. Please fetch one first.",
      );
      return;
    }

    try {
      const res = await fetch(`http://localhost:8080/adaptation/${nodeID}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(fetchedTM.value),
      });

      const text = await res.text();

      if (res.ok) {
        showNotification("success", `Adaptation successful: ${text}`);
      } else {
        showNotification("error", `Error ${res.status}: ${text}`);
      }
    } catch (err) {
      showNotification(
        "error",
        err instanceof Error
          ? `Submission failed: ${err.message}`
          : `An unexpected error occurred during submission: ${String(err)}`,
      );
    }
  };

  return (
    <div class="container mx-auto p-4 md:p-8 my-8 relative">
      <div
        class={`
          grid grid-cols-1 lg:grid-cols-2 
          gap-x-1 gap-y-8 
          bg-white shadow-lg rounded-lg p-8 md:p-10
          `}
      >
        <div class="space-y-6">
          <h1 class="text-3xl font-extrabold text-gray-900">Adapt End Node</h1>

          <div class="text-gray-700 text-lg space-y-2">
            <p>
              <span class="font-semibold">End Node ID:</span> {nodeID}
            </p>
            <p>
              <span class="font-semibold">Current Model:</span>{" "}
              <span class="text-indigo-600">
                {decodeURIComponent(modelTitle)}
              </span>
            </p>
          </div>

          <p class="text-base text-gray-600">
            Adapt the end node by providing a new Application Thing Model below.
          </p>

          <div class="space-y-6">
            <AdaptationFormInputs
              url={url} // Pass signal value
              onUrlChange={setUrl} // Update signal value
              onFetch={handleTMFetch}
              onSubmit={handleSubmitTM}
              notification={notification} // Pass signal value
              showSubmitButton={!!fetchedTM.value} // Access signal value
            />
          </div>
        </div>

        {/* Right Column: JSON Display */}
        <div class="flex flex-col space-y-4">
          <h3 class="text-xl font-semibold text-gray-800">
            Thing Model Preview
          </h3>
          {fetchedTM.value // Check if a TM has been fetched
            ? (
              <JsonViewer
                data={fetchedTM.value}
                className={`
                  flex-1 min-h-[400px] max-h-[calc(100vh-300px)] 
                  overflow-y-auto overflow-x-auto
                  border border-gray-200 rounded-md shadow-inner bg-white
                  `}
              />
            )
            : (
              <div
                class={`
                  flex-1 min-h-[400px] flex items-center justify-center 
                  bg-gray-50 border border-gray-200 rounded-md text-gray-500`}
              >
                Thing Model will appear here after fetching.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
