import { sequence } from "@sveltejs/kit/hooks";
import { initDatabase } from "$src/lib/database/db.js";

export async function handle_db_connect({ event, resolve }) {
    // Only initialize if D1 database binding exists (Cloudflare Workers environment)
    if (event?.platform?.env?.DB) {
        initDatabase(event.platform.env.DB);
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
        message: error?.message || message,
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
