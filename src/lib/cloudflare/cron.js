/**
 * ⚠️ IMPORTANT: This handler is added to the worker after the SvelteKit build process
 * SvelteKit's Cloudflare adapter doesn't support custom worker handlers, so the
 * `postbuild` script (see ./postbuild.js) wraps the generated worker and adds
 * the `scheduled` handler exported from this module.
 */

/**
 * Worker environment bindings available to the scheduled cron handler
 * @typedef {Object} CronEnv
 * @property {{fetch(request: Request): Promise<Response>}} [SELF] - Service binding for production self-calls (Cloudflare Workers);
 *   absent in local `wrangler dev`, where the handler calls http://localhost:8787 directly
 * @property {string} [CRON_SECRET] - Runtime secret for authenticating internal cron requests
 *   (`npx wrangler secret put CRON_SECRET --env production`, locally from `.env`). It is the
 *   same Worker env value /api/cron reads via `$app/env/private`
 */

/**
 * Cloudflare Workers `scheduled` handler, invoked by the cron triggers in wrangler.jsonc
 * @param {{cron?: string, scheduledTime?: number}} event - Scheduled event details from the cron trigger
 * @param {CronEnv} env - Environment object containing bindings and secrets
 * @param {{waitUntil(promise: Promise<any>): void}} ctx - Worker execution context
 */
export async function scheduled(event, env, ctx) {
    ctx.waitUntil(cron(env));
}

/**
 * Headers for the internal POST to /api/cron
 *
 * When CRON_SECRET is missing the header is left out (instead of sending the
 * string "undefined"): /api/cron then still answers demo deployments with a
 * "skipped" 200 and rejects everything else with 503, failing the run.
 * @param {CronEnv} env - Environment object containing bindings and secrets
 * @returns {Record<string, string>} Request headers
 */
function cronHeaders(env) {
    /** @type {Record<string, string>} */
    const headers = {
        // Required since SvelteKit 3 - POST requests without a Content-Type
        // and without a matching Origin are rejected as CSRF (403)
        "content-type": "application/json",
    };

    if (env.CRON_SECRET) {
        headers["x-cron-secret"] = env.CRON_SECRET;
    } else {
        console.warn(
            '⚠️ CRON_SECRET is not set - /api/cron rejects this call unless the app runs in demo mode. Run "npx wrangler secret put CRON_SECRET --env production" (locally: set it in .env)'
        );
    }

    return headers;
}

/**
 * Main cron logic that performs scheduled tasks
 * Makes internal API calls to trigger domain checking or other scheduled operations
 *
 * Production calls itself through the SELF service binding (env.production in
 * wrangler.jsonc); without that binding (local `wrangler dev` / `pnpm preview`)
 * it calls the local dev server on http://localhost:8787 directly
 *
 * @param {CronEnv} env - Environment object containing bindings and secrets
 * @returns {Promise<void>}
 * @throws {Error} When the self-call fails, so the scheduled run shows up as
 *   failed in the Cloudflare dashboard instead of silently "succeeding"
 */
async function cron(env) {
    console.log("🚀 Starting cron...");

    try {
        // Production environment - use service binding
        if (env.SELF) {
            /**
             * Create internal request to cron API endpoint
             * Uses service binding for efficient internal communication in production
             */
            const selfRequest = new Request("http://localhost/api/cron", {
                method: "POST",
                headers: cronHeaders(env),
            });

            // Use the SELF binding to fetch the internal endpoint - Cloudflare Workers Production
            const response = await env.SELF.fetch(selfRequest);
            console.log("📡 Response:", response);

            if (!response.ok) {
                throw new Error(
                    `Cron self-call failed with status ${response.status}`
                );
            }

            console.log("✅ Production - Self-call completed successfully!");
        } else {
            /**
             * Local development - there is no SELF binding outside env.production,
             * so fetch the local dev server directly (default Wrangler port 8787)
             */
            const selfRequest = new Request("http://localhost:8787/api/cron", {
                method: "POST",
                headers: cronHeaders(env),
            });

            const response = await fetch(selfRequest);
            console.log("📡 Response:", response);

            if (!response.ok) {
                throw new Error(
                    `Cron self-call failed with status ${response.status}`
                );
            }

            console.log("✅ Local - Self-call completed successfully!");
        }
    } catch (error) {
        console.error("❌ Cron request failed with error:", error);
        // Re-throw so ctx.waitUntil records the run as failed
        throw error;
    }
}
