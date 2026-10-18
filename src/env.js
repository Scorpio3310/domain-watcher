import { defineEnvVars } from "@sveltejs/kit/env";

/**
 * Schema for optional variables - an unset or empty value becomes `undefined`.
 * Dynamic variables without a schema are required and the app would fail to
 * start without them.
 * @param {string | undefined} value - Raw value from the environment
 * @returns {string | undefined} The value, or `undefined` when unset or empty
 */
const optional = (value) => value || undefined;

/**
 * Environment variables, available via `$app/env/private` and `$app/env/public`.
 * `static` variables are inlined at build time (the same behaviour as the
 * previous `$env/static/*` modules). The others are runtime secrets read when
 * the app starts - on Cloudflare from the Worker env (`wrangler secret put`),
 * in `vite dev` from `.env` - see `.env.example` for details.
 * @see https://svelte.dev/docs/kit/environment-variables
 */
export const variables = defineEnvVars({
    PRODUCTION_DOMAIN: {
        static: true,
        description:
            "Production domain URL, used for robots.txt detection and email assets",
    },
    ALLOW_ROBOTS: {
        static: true,
        description: 'Set to "true" to allow search engine indexing',
    },
    CRON_SECRET: {
        schema: optional,
        description:
            "Runtime secret required in the x-cron-secret header of /api/cron, also sent by the scheduled cron handler (src/lib/cloudflare/cron.js). " +
            "Set it with `npx wrangler secret put CRON_SECRET --env production`. When unset, /api/cron rejects every request",
    },
    ADMIN_PASSWORD: {
        schema: optional,
        description:
            "Runtime secret protecting the whole app with HTTP Basic Auth (any username, this password). " +
            "Set it with `npx wrangler secret put ADMIN_PASSWORD --env production`. " +
            "When unset, deployed builds respond 503 while `vite dev` stays open with a warning. Ignored in demo mode",
    },
    PUBLIC_ENVIRONMENT: {
        public: true,
        static: true,
        description: "Application environment: dev, demo, staging or production",
    },
    PUBLIC_TIMEZONE: {
        public: true,
        static: true,
        description: "IANA timezone used for dates and notification schedules",
    },
});
