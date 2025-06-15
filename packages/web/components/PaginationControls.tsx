interface Props {
  basePath: string;
  offset: number;
  limit: number;
}

export default function PaginationControls({ basePath, offset, limit }: Props) {
  const newOffsetUrl = (delta: number) =>
    `${basePath}?offset=${Math.max(offset + delta, 0)}&limit=${limit}`;

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
          href={newOffsetUrl(-limit)}
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
        >
          Previous
        </a>
        <a
          href={newOffsetUrl(limit)}
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded"
        >
          Next
        </a>
      </div>
    </div>
  );
}
