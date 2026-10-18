// Minimal ambient types for the Cloudflare Workers runtime module.
// Only the bindings used by the app are declared here (see wrangler.jsonc),
// run `wrangler types` if you need the full generated runtime types instead.
declare module "cloudflare:workers" {
	export const env: {
		/** D1 database binding (`d1_databases[].binding` in wrangler.jsonc) */
		DB?: import("#lib/database/db.js").D1Database;
	};
	/** Extends the current request's lifetime until the promise settles (`ctx.waitUntil`) */
	export function waitUntil(promise: Promise<unknown>): void;
}
