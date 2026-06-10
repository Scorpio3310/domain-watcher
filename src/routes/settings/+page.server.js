/**
 * @fileoverview Settings page server load and actions
 */

/** @import { ServiceResult, SlackConfig, ResendConfig } from '$lib/types' */

import { error } from "@sveltejs/kit";
import { getErrorMessage, getHttpStatus } from "$src/lib/utils/helpers";
import { message, superValidate, fail } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import {
    whoIsApiKeySchema,
    uiViewSchema,
    toggleFormSchema,
    slackWebhookSchema,
    resendSchema,
} from "./validation";
import { apiKey } from "$src/lib/server/infrastructure/api-key";
import { ui } from "$src/lib/server/services/settings";
import { slack } from "$src/lib/server/infrastructure/slack-client";
import { resend } from "$src/lib/server/infrastructure/resend-client";

// ========================================
// PAGE LOAD
// ========================================

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    try {
        // Fetch all settings data in parallel
        const [
            apiKeyConfig,
            rawViewMode,
            isSlackNotificationEnabled,
            rawSlackWebhookConfig,
            isResendNotificationEnabled,
            rawResendConfig,
        ] = await Promise.all([
            apiKey.getConfig(),
            ui.getViewMode(),
            slack.getNotificationStatus(),
            slack.getWebhookConfig(),
            resend.getNotificationStatus(),
            resend.getResendConfig(),
        ]);

        const currentViewMode = /** @type {string} */ (rawViewMode);
        const slackWebhookConfig = /** @type {SlackConfig | null} */ (
            rawSlackWebhookConfig
        );
        const resendConfig = /** @type {ResendConfig | null} */ (
            rawResendConfig
        );

        // Create form instances with current values
        const formApiKey = await superValidate(
            { apiKey: apiKeyConfig?.api_key || "" },
            zod4(whoIsApiKeySchema)
        );

        const formUiView = await superValidate(
            { viewMode: currentViewMode },
            zod4(uiViewSchema)
        );

        const formSlackEnabled = await superValidate(
            { enabled: isSlackNotificationEnabled },
            zod4(toggleFormSchema)
        );

        const formSlackWebhook = await superValidate(
            {
                webhook: slackWebhookConfig?.webhook_url || "",
                notificationTime: slackWebhookConfig?.notification_time || "",
            },
            zod4(slackWebhookSchema)
        );

        const formResendEnabled = await superValidate(
            { enabled: isResendNotificationEnabled },
            zod4(toggleFormSchema)
        );

        const formResend = await superValidate(
            {
                apiKey: resendConfig?.api_key || "",
                fromEmail: resendConfig?.from_email || "",
                toEmail: resendConfig?.to_email || "",
                notificationTime: resendConfig?.notification_time || "",
            },
            zod4(resendSchema)
        );

        return {
            viewMode: currentViewMode,
            apiKeyConfig,
            slackWebhookConfig,
            resendConfig,
            // Forms
            formApiKey,
            formUiView,
            formSlackEnabled,
            formSlackWebhook,
            formResendEnabled,
            formResend,
        };
    } catch (err) {
        console.error("❌ Settings page load failed:", err);
        throw error(getHttpStatus(err), {
            message: getErrorMessage(err),
        });
    }
}

// ========================================
// FORM ACTIONS
// ========================================

export const actions = {
    /**
     * Save and test API key
     */
    saveApiKey: async ({ request }) => {
        const form = await superValidate(request, zod4(whoIsApiKeySchema));

        if (!form.valid) {
            return fail(400, { form: form });
        }

        const result = await apiKey.save(form.data.apiKey);

        return message(form, {
            status: result.status,
            message: result.message,
        });
    },

    /**
     * Update UI view mode
     */
    updateUIView: async ({ request }) => {
        const form = await superValidate(request, zod4(uiViewSchema));

        if (!form.valid) {
            return fail(400, { form: form });
        }

        const result = /** @type {ServiceResult} */ (
            await ui.saveViewMode(form.data.viewMode)
        );

        return message(form, {
            status: result.status,
            message: result.message,
        });
    },

    /**
     * Enable/disable Slack notifications
     */
    updateSlackEnabled: async ({ request }) => {
        const form = await superValidate(request, zod4(toggleFormSchema));

        if (!form.valid) {
            return fail(400, { form: form });
        }

        const result = /** @type {ServiceResult} */ (
            await slack.saveNotificationStatus(form.data.enabled)
        );

        return message(form, {
            status: result.status,
            message: result.message,
        });
    },

    /**
     * Update Slack webhook configuration
     */
    updateSlackWebhook: async ({ request }) => {
        const form = await superValidate(request, zod4(slackWebhookSchema));

        if (!form.valid) {
            return fail(400, { form: form });
        }

        const { webhook, notificationTime, sendTestMessage } = form.data;
        const result = /** @type {ServiceResult} */ (
            await slack.saveWebhook(webhook, notificationTime, {
                shouldTestConnection: sendTestMessage,
            })
        );

        return message(form, {
            status: result.status,
            message: result.message,
        });
    },

    /**
     * Enable/disable Resend notifications
     */
    updateResendEnabled: async ({ request }) => {
        const form = await superValidate(request, zod4(toggleFormSchema));

        if (!form.valid) {
            return fail(400, { form: form });
        }

        const result = /** @type {ServiceResult} */ (
            await resend.saveNotificationStatus(form.data.enabled)
        );

        return message(form, {
            status: result.status,
            message: result.message,
        });
    },

    /**
     * Update Resend configuration
     */
    updateResendKey: async ({ request }) => {
        const form = await superValidate(request, zod4(resendSchema));

        if (!form.valid) {
            return fail(400, { form: form });
        }

        const {
            apiKey,
            fromEmail,
            toEmail,
            notificationTime,
            sendTestMessage,
        } = form.data;
        const result = /** @type {ServiceResult} */ (
            await resend.saveConfig(apiKey, fromEmail, toEmail, notificationTime, {
                shouldTestConnection: sendTestMessage,
            })
        );

        return message(form, {
            status: result.status,
            message: result.message,
        });
    },
};
