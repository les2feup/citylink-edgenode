interface Props {
  basePath: string;
  offset: number;
  limit: number;
  headers?: Record<string, string[]>;
}

export default function PaginationControls(
  { basePath, offset, limit, headers }: Props,
) {
  const newOffsetUrl = (delta: number) =>
    `${basePath}?offset=${Math.max(offset + delta, 0)}&limit=${limit}`;

  const hasNext = headers && headers["link"] && headers["link"].length > 0 &&
    headers["link"].some((link) => {
      link.includes('rel="next"');
    });

  const hasPrev = offset > 0;

  return (
    <div class="space-y-4">
      <form method="GET" action={basePath} class="space-x-2">
        <label>
          Limit:
          <input
            type="number"
            name="limit"
            min="1"
            value={limit}
            class="ml-2 px-2 py-1 border rounded"
          />
        </label>
        <input type="hidden" name="offset" value="0" />
        <button type="submit" class="px-3 py-1 bg-blue-600 text-white rounded">
          Apply
        </button>
      </form>

      <div class="flex justify-between">
        <a
          href={hasPrev ? newOffsetUrl(-limit) : "#"}
          class={`px-4 py-2 rounded ${
            hasPrev
              ? "bg-gray-200 hover:bg-gray-300"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
          aria-disabled={!hasPrev}
        >
          Previous
        </a>

        <a
          href={hasNext ? newOffsetUrl(limit) : "#"}
          class={`px-4 py-2 rounded ${
            hasNext
              ? "bg-gray-200 hover:bg-gray-300"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
          aria-disabled={!hasNext}
        >
          Next
        </a>
      </div>
    </div>
  );
}
