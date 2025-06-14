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
        const json = await res.json();
        if (
          json == null ||
          (typeof json === "object" && Object.keys(json).length === 0)
        ) {
          return ctx.renderNotFound();
        }
        return ctx.render(json as T);
      } catch (err) {
        console.error("[fetch error]", err);
        return new Response("Internal Server Error", { status: 500 });
      }
    },
  };
}
