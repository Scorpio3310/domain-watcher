import { z } from "zod/v4";

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
    enabled: z.boolean(),
});

export const slackWebhookSchema = z.object({
    webhook: z
        .string()
        .min(1, "Slack Webhook is required")
        .url("Must be a valid URL")
        .refine(
            (url) => url.startsWith("https://hooks.slack.com"),
            "Must be a valid Slack webhook URL"
        )
        .max(253, "Slack Webhook too long"),
    notificationTime: z
        .string()
        .regex(
            /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
            "Time must be in HH:MM format (e.g., 14:30)"
        ),
    sendTestMessage: z.boolean(),
});

export const resendSchema = z.object({
    apiKey: z
        .string()
        .min(1, "API key is required")
        .max(253, "API key too long"),
    fromEmail: z
        .string()
        .min(1, "From email is required")
        .email("Must be a valid email address"),
    toEmail: z
        .string()
        .min(1, "To email is required")
        .email("Must be a valid email address"),
    notificationTime: z
        .string()
        .regex(
            /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
            "Time must be in HH:MM format (e.g., 14:30)"
        ),
    sendTestMessage: z.boolean(),
});
