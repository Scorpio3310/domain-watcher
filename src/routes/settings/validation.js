import { z } from "zod/v4";

// Unchecked checkboxes are absent from FormData entirely; zod 4 rejects a
// missing object key before coercion runs ("expected nonoptional"), so the
// field needs .default(false). The cast narrows the input type from `unknown`
// to `boolean` so the schema satisfies SvelteKit form()'s
// StandardSchemaV1<RemoteFormInput, ...> constraint.
const checkboxBoolean = () =>
    /** @type {import("zod/v4").ZodDefault<import("zod/v4").ZodCoercedBoolean<boolean>>} */ (
        z.coerce.boolean().default(false)
    );

export const whoIsApiKeySchema = z.object({
    apiKey: z
        .string()
        .min(1, "API key is required")
        .max(253, "API key too long"),
});

export const domainProviderSchema = z.object({
    provider: z
        .string()
        .refine((value) => value === "rdap" || value === "whoisjson", {
            message: "Provider must be 'rdap' or 'whoisjson'",
        }),
    whoisjsonFallback: checkboxBoolean(),
});

export const uiViewSchema = z.object({
    viewMode: z
        .string()
        .refine((value) => value === "compact" || value === "detailed", {
            message: "View mode must be 'compact' or 'detailed'",
        }),
});

export const toggleFormSchema = z.object({
    enabled: checkboxBoolean(),
});

// Strict zero-padded HH:MM (00:00-23:59). The cron compares the stored value
// as a string against the zero-padded current time, so "9:30" or "24:00"
// would save fine but never fire.
const notificationTimeSchema = z
    .string()
    .regex(
        /^([01][0-9]|2[0-3]):[0-5][0-9]$/,
        "Time must be in HH:MM format (e.g., 14:30)"
    );

const DISCORD_WEBHOOK_HOSTS = new Set([
    "discord.com",
    "ptb.discord.com",
    "canary.discord.com",
    "discordapp.com",
    "ptb.discordapp.com",
    "canary.discordapp.com",
]);

/**
 * Parse an absolute URL, or return null when it can't be parsed
 * @param {string} value - URL string
 * @returns {URL|null} Parsed URL or null
 */
const parseUrl = (value) => {
    try {
        return new URL(value);
    } catch {
        return null;
    }
};

/**
 * Check for a plain https URL: no credentials and no non-default port
 * (so "https://hooks.slack.com@evil.example" can't pass a host check)
 * @param {URL} url - Parsed URL
 * @returns {boolean} True for https without username, password or port
 */
const isPlainHttpsUrl = (url) =>
    url.protocol === "https:" && !url.username && !url.password && !url.port;

/**
 * Check for a Slack incoming webhook URL (https://hooks.slack.com/services/...)
 * @param {string} value - URL string
 * @returns {boolean} True when the parsed URL is a Slack webhook URL
 */
export const isSlackWebhookUrl = (value) => {
    const url = parseUrl(value);
    return (
        url !== null &&
        isPlainHttpsUrl(url) &&
        url.hostname === "hooks.slack.com" &&
        url.pathname.startsWith("/services/")
    );
};

/**
 * Check for a Discord webhook URL on discord.com / discordapp.com (incl. the
 * ptb. and canary. clients), path /api/webhooks/... or /api/vN/webhooks/...
 * @param {string} value - URL string
 * @returns {boolean} True when the parsed URL is a Discord webhook URL
 */
export const isDiscordWebhookUrl = (value) => {
    const url = parseUrl(value);
    return (
        url !== null &&
        isPlainHttpsUrl(url) &&
        DISCORD_WEBHOOK_HOSTS.has(url.hostname) &&
        /^\/api\/(?:v\d+\/)?webhooks\//.test(url.pathname)
    );
};

export const slackWebhookSchema = z.object({
    webhook: z
        .url("Must be a valid URL")
        .max(253, "Slack Webhook too long")
        .refine(isSlackWebhookUrl, "Must be a valid Slack webhook URL"),
    notificationTime: notificationTimeSchema,
    sendTestMessage: checkboxBoolean(),
});

export const discordWebhookSchema = z.object({
    webhook: z
        .url("Must be a valid URL")
        .max(253, "Discord Webhook too long")
        .refine(isDiscordWebhookUrl, "Must be a valid Discord webhook URL"),
    notificationTime: notificationTimeSchema,
    sendTestMessage: checkboxBoolean(),
});

export const resendSchema = z.object({
    apiKey: z
        .string()
        .min(1, "API key is required")
        .max(253, "API key too long"),
    fromEmail: z.email("Must be a valid email address"),
    toEmail: z.email("Must be a valid email address"),
    notificationTime: notificationTimeSchema,
    sendTestMessage: checkboxBoolean(),
});
