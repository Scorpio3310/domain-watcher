import { sequence } from "@sveltejs/kit/hooks";
import { initDatabase } from "$src/lib/database/db.js";

/** @type {import('@sveltejs/kit').Handle} */
export async function handle_db_connect({ event, resolve }) {
    // App.Platform is not declared in app.d.ts, so narrow the Cloudflare
    // Workers platform shape locally to access the D1 binding.
    const platform =
        /** @type {{ env?: { DB?: import('$src/lib/database/db').D1Database } } | undefined} */ (
            event.platform
        );
    // Only initialize if D1 database binding exists (Cloudflare Workers environment)
    if (platform?.env?.DB) {
        initDatabase(platform.env.DB);
    }
    return await resolve(event);
}

/**
 * Basic error handler with simple logging
 * @type {import('@sveltejs/kit').HandleServerError}
 */
export async function handleError({ error, event, status, message }) {
    // Simple error logging
    console.error("🚨 Server Error:", {
        message: error instanceof Error ? error.message : message,
        status,
        url: event.url.pathname,
        timestamp: new Date().toISOString(),
    });

    // Return clean error message
    return {
        message: status >= 500 ? "Something went wrong" : message,
    };
}

export const handle = sequence(handle_db_connect);
