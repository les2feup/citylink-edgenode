import { FreshContext, Handlers } from "$fresh/server.ts";

/**
 * Build a GET handler that:
 *  - invokes your `buildUrl(ctx)` to fetch JSON
 *  - on non‐OK or empty JSON → 404
 *  - on network or JSON‐parse error → 500
 */
export function createGetHandler<T>(
  buildUrl: (ctx: FreshContext) => string,
): Handlers<T> {
  return {
    async GET(_req, ctx) {
      const url = buildUrl(ctx);
      try {
        const res = await fetch(url);
        if (!res.ok) return ctx.renderNotFound();
        const data = await res.json();

        if (
          data == null ||
          (typeof data === "object" && Object.keys(data).length === 0)
        ) {
          return ctx.renderNotFound();
        }

        // Collect headers with possible duplicates
        const headers: Record<string, string[]> = {};
        for (const [key, value] of res.headers) {
          if (!headers[key]) headers[key] = [];
          headers[key].push(value);
        }

        return ctx.render({ data, headers } as T);
      } catch (err) {
        console.error("[fetch error]", err);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  };
}
