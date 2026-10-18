import { defineEnvVars } from "@sveltejs/kit/env";

/**
 * Environment variables, available via `$app/env/private` and `$app/env/public`.
 * All of them are `static`, i.e. inlined at build time (the same behaviour as the
 * previous `$env/static/*` modules) - see `.env.example` for details.
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
        static: true,
        description: "Secret required in the x-cron-secret header of /api/cron",
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
