/**
 * ⚠️ IMPORTANT: This handler must be added manually after SvelteKit build process
 * SvelteKit's Cloudflare adapter doesn't automatically include cron handlers,
 * so this code needs to be injected into the generated worker file.
 */
worker_default.scheduled = async (event, env, ctx) => {
    ctx.waitUntil(cron(env));
};

/**
 * Main cron logic that performs scheduled tasks
 * Makes internal API calls to trigger domain checking or other scheduled operations
 *
 * Supports both production (env.SELF) and local development (env.SELF_LOCAL) environments
 *
 * @param {object} env - Environment object containing bindings and secrets
 * @param {object} env.SELF - Service binding for production self-calls (Cloudflare Workers)
 * @param {object} env.SELF_LOCAL - Local development binding for self-calls
 * @param {string} env.CRON_SECRET - Secret key for authenticating internal cron requests
 * @returns {Promise<void>}
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
                headers: {
                    "x-cron-secret": env.CRON_SECRET,
                },
            });

            // Use the SELF binding to fetch the internal endpoint - Cloudflare Workers Production
            const response = await env.SELF.fetch(selfRequest);
            console.log("📡 Response:", response);

            if (!response.ok) {
                console.error(
                    "❌ Self-call failed with status:",
                    response.status
                );
            } else {
                console.log(
                    "✅ Production - Self-call completed successfully!"
                );
            }
        }

        // Local development environment - use direct fetch
        if (env.SELF_LOCAL) {
            /**
             * Create internal request for local development
             * Uses direct fetch to localhost:8787 (default Wrangler dev server port)
             */
            const selfRequest = new Request("http://localhost:8787/api/cron", {
                method: "POST",
                headers: {
                    "x-cron-secret": env.CRON_SECRET,
                },
            });

            const response = await fetch(selfRequest);
            console.log("📡 Response:", response);

            if (!response.ok) {
                console.error(
                    "❌ Self-call failed with status:",
                    response.status
                );
            } else {
                console.log("✅ Local - Self-call completed successfully!");
            }
        }
    } catch (error) {
        console.error("❌ Cron request failed with error:", error);
    }
}
