import { env } from "cloudflare:workers";
import { sequence } from "@sveltejs/kit/hooks";
import { dev } from "$app/env";
import { ADMIN_PASSWORD } from "$app/env/private";
import { initDatabase } from "#lib/database/db.js";
import { getErrorMessage, isDemo } from "#lib/utils/helpers.js";
import { timingSafeEqual } from "#lib/server/utils/crypto.js";

/**
 * Paths reachable without the admin password: `/api/cron` is protected by its
 * own `x-cron-secret` header (the scheduled SELF call carries no browser
 * credentials) and `/robots.txt` must stay readable for crawlers.
 * Static assets never reach the worker - Cloudflare serves them first.
 */
const PUBLIC_PATHS = new Set(["/api/cron", "/robots.txt"]);

const WWW_AUTHENTICATE = 'Basic realm="Domain Watcher", charset="UTF-8"';

/** Hosts served over plain HTTP locally (`wrangler dev` / `pnpm preview`) */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Log the missing ADMIN_PASSWORD only once per server instance / isolate */
let missingPasswordLogged = false;

/**
 * Extracts the password from an HTTP Basic `Authorization` header
 * @param {string | null} header - Value of the `Authorization` request header
 * @returns {string | null} The password (UTF-8 decoded), or null when the
 *   header is missing or malformed
 */
function getBasicAuthPassword(header) {
    const match = header?.match(/^Basic\s+(\S+)\s*$/i);
    if (!match) return null;

    try {
        const bytes = Uint8Array.from(atob(match[1]), (char) =>
            char.charCodeAt(0)
        );
        const credentials = new TextDecoder().decode(bytes);
        const separator = credentials.indexOf(":");
        // Any username is accepted, only the password after the first ":" counts
        return separator === -1 ? null : credentials.slice(separator + 1);
    } catch {
        // Invalid base64
        return null;
    }
}

/**
 * Forbids framing the app, so a hostile page can't load it in a hidden iframe
 * and trick the logged-in admin into one-click settings changes or deletes
 * (clickjacking - the browser sends the cached Basic credentials along).
 *
 * Runs first, so every response SvelteKit resolves (pages, `__data.json`,
 * remote functions, endpoints, public paths and demo mode) carries the
 * headers. Early 308/401/503 responses of the auth handle skip them, as they
 * have nothing worth framing.
 * @type {import('@sveltejs/kit/hooks').Handle}
 */
export async function handle_frame_protection({ event, resolve }) {
    event.setHeaders({
        "x-frame-options": "DENY",
        "content-security-policy": "frame-ancestors 'none'",
    });
    return await resolve(event);
}

/**
 * Protects the whole app (pages, `__data.json`, remote functions, endpoints)
 * with HTTP Basic Auth using the `ADMIN_PASSWORD` runtime secret
 *
 * - `/api/cron` and `/robots.txt` are exempt (see PUBLIC_PATHS)
 * - plain HTTP is redirected to HTTPS first (except localhost), so the
 *   credentials are never sent in cleartext
 * - demo mode is a public read-only showcase, so it is never protected
 * - without `ADMIN_PASSWORD` the dev server stays open (with a warning), while
 *   any other build fails closed with 503 so a misconfigured deployment is
 *   never left open
 * @type {import('@sveltejs/kit/hooks').Handle}
 */
export async function handle_basic_auth({ event, resolve }) {
    const isPublicPath =
        PUBLIC_PATHS.has(event.url.pathname) &&
        !event.isDataRequest &&
        !event.isRemoteRequest;

    if (isPublicPath || isDemo()) {
        return await resolve(event);
    }

    // Never ask for Basic credentials over plain HTTP (they'd travel in
    // cleartext) - e.g. a custom domain without "Always Use HTTPS"
    if (
        !dev &&
        event.url.protocol === "http:" &&
        !LOCAL_HOSTS.has(event.url.hostname)
    ) {
        const httpsUrl = new URL(event.url);
        httpsUrl.protocol = "https:";
        return new Response(null, {
            status: 308,
            headers: { location: httpsUrl.href },
        });
    }

    if (!ADMIN_PASSWORD) {
        if (dev) {
            if (!missingPasswordLogged) {
                missingPasswordLogged = true;
                console.warn(
                    "⚠️ ADMIN_PASSWORD is not set - the app is NOT password protected (allowed in dev only)"
                );
            }
            return await resolve(event);
        }

        if (!missingPasswordLogged) {
            missingPasswordLogged = true;
            console.error(
                '🔒 ADMIN_PASSWORD is not set - every request is rejected with 503. Run "npx wrangler secret put ADMIN_PASSWORD --env production"'
            );
        }
        return new Response(
            "Domain Watcher is locked: the ADMIN_PASSWORD secret is not set.\n" +
                "Set it with: npx wrangler secret put ADMIN_PASSWORD --env production\n",
            {
                status: 503,
                headers: { "content-type": "text/plain; charset=utf-8" },
            }
        );
    }

    const password = getBasicAuthPassword(
        event.request.headers.get("authorization")
    );

    if (
        password === null ||
        !(await timingSafeEqual(password, ADMIN_PASSWORD))
    ) {
        if (password !== null) {
            console.warn(
                `🔒 Invalid admin password for ${event.request.method} ${event.url.pathname}`
            );
        }
        return new Response("Authentication required\n", {
            status: 401,
            headers: {
                "content-type": "text/plain; charset=utf-8",
                "www-authenticate": WWW_AUTHENTICATE,
            },
        });
    }

    return await resolve(event);
}

/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle_db_connect({ event, resolve }) {
    // Cloudflare bindings are read from `cloudflare:workers` (emulated by the
    // adapter during `vite dev`), no longer from `event.platform`.
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

// Frame protection only queues response headers; authentication then runs
// before anything else, so unauthenticated requests never touch the database
export const handle = sequence(
    handle_frame_protection,
    handle_basic_auth,
    handle_db_connect
);
