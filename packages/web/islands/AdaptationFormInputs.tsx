// islands/AdaptationFormInputs.tsx (remains the same as previous iteration)

type Props = {
  url: string;
  onUrlChange: (url: string) => void;
  onFetch: () => void;
  onSubmit: () => void;
  notification: notificationType | null;
  showSubmitButton: boolean;
};

export type notificationType =
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function AdaptationFormInputs(
  { url, onUrlChange, onFetch, onSubmit, notification, showSubmitButton }:
    Props,
) {
  return (
    <div class="space-y-6">
      {/* Notification Area within the left column */}
      {notification && (
        <div
          class={`
            p-3 rounded-md text-sm font-medium
            ${
            notification.type === "success"
              ? "bg-green-100 text-green-800 border border-green-200"
              : "bg-red-100 text-red-800 border border-red-200"
          } flex items-center justify-between gap-2 w-full md:w-5/6`}
        >
          <span>{notification.message}</span>
        </div>
      )}

      <div class="space-y-4">
        <input
          type="text"
          placeholder="Enter Thing Model URL (e.g., https://example.com/model.tm.json)"
          class={`
            w-full md:w-5/6 p-3 border border-gray-300 rounded-md shadow-sm
            focus:ring-indigo-500 focus:border-indigo-500 text-gray-800 text-base
          `}
          value={url}
          onInput={(e) => onUrlChange(e.currentTarget.value)}
        />
        {/* Error messages are now handled by the notification system */}
      </div>

      <div class="flex flex-wrap gap-4">
        <button
          type="button"
          class="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition ease-in-out duration-150 text-base flex-grow sm:flex-grow-0"
          onClick={onFetch}
        >
          Fetch & Preview
        </button>
        {showSubmitButton && (
          <button
            type="button"
            class="px-6 py-3 bg-green-600 text-white font-semibold rounded-md shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition ease-in-out duration-150 text-base flex-grow sm:flex-grow-0"
            onClick={onSubmit}
          >
            Submit Thing Model
          </button>
        )}
      </div>
    </div>
  );
}
