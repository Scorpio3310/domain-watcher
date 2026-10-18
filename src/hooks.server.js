import { env } from "cloudflare:workers";
import { sequence } from "@sveltejs/kit/hooks";
import { initDatabase } from "#lib/database/db.js";
import { getErrorMessage } from "#lib/utils/helpers.js";

/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle_db_connect({ event, resolve }) {
    // Cloudflare bindings are read from `cloudflare:workers` (emulated by the
    // adapter during `vite dev` / `vite preview`), no longer from `event.platform`.
    // Only initialize if D1 database binding exists (Cloudflare Workers environment)
    if (env.DB) {
        initDatabase(env.DB);
    }
    return await resolve(event);
}

/**
 * Basic error handler with simple logging
 *
 * Since SvelteKit 3 every error passes through this hook, so `kind` tells
 * where it came from: `app` (thrown with `error(...)`), `framework` (404,
 * 405, ...), `validation` (invalid remote function input) or `unknown`.
 * @type {import('@sveltejs/kit/hooks').HandleServerError}
 */
export async function handleError({ kind, error, event }) {
    // Errors thrown with `error(...)` and remote function validation errors
    // are expected and safe to expose - pass them through unchanged
    if (kind === "app" || kind === "validation") {
        return error;
    }

    // Simple error logging
    console.error("🚨 Server Error:", {
        message: getErrorMessage(error),
        status: kind === "framework" ? error.status : 500,
        url: event.url.pathname,
        timestamp: new Date().toISOString(),
    });

    // Framework errors only carry a safe `{ status, message }` (e.g. "Not Found"),
    // anything unknown gets a generic message so internals are never leaked
    if (kind === "framework") {
        return error;
    }

    return {
        message: "Something went wrong",
    };
}

export const handle = sequence(handle_db_connect);
