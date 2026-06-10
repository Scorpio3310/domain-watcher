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

export const slackWebhookSchema = z.object({
    webhook: z
        .url("Must be a valid URL")
        .max(253, "Slack Webhook too long")
        .refine(
            (url) => url.startsWith("https://hooks.slack.com"),
            "Must be a valid Slack webhook URL"
        ),
    notificationTime: z
        .string()
        .regex(
            /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
            "Time must be in HH:MM format (e.g., 14:30)"
        ),
    sendTestMessage: checkboxBoolean(),
});

export const resendSchema = z.object({
    apiKey: z
        .string()
        .min(1, "API key is required")
        .max(253, "API key too long"),
    fromEmail: z.email("Must be a valid email address"),
    toEmail: z.email("Must be a valid email address"),
    notificationTime: z
        .string()
        .regex(
            /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
            "Time must be in HH:MM format (e.g., 14:30)"
        ),
    sendTestMessage: checkboxBoolean(),
});
