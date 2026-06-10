/**
 * @fileoverview Settings remote functions: WhoisJSON API key, UI view mode,
 * and Slack/Resend notification configuration.
 * Demo-mode gating happens inside the underlying services/clients; the
 * try/catch here is a safety net for unexpected throws so the client always
 * receives a {status, message} result instead of an error page.
 * @module SettingsRemote
 */

/** @import { ServiceResult } from '$lib/types' */

import { form } from "$app/server";
import {
    whoIsApiKeySchema,
    uiViewSchema,
    toggleFormSchema,
    slackWebhookSchema,
    resendSchema,
} from "$src/routes/settings/validation";
import { apiKey } from "$src/lib/server/infrastructure/api-key";
import { ui } from "$src/lib/server/services/settings";
import { slack } from "$src/lib/server/infrastructure/slack-client";
import { resend } from "$src/lib/server/infrastructure/resend-client";
import { getErrorMessage } from "$src/lib/utils/helpers";

/**
 * Save and test the WhoisJSON API key.
 * @function saveApiKey
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const saveApiKey = form(whoIsApiKeySchema, async ({ apiKey: key }) => {
    try {
        const result = /** @type {ServiceResult} */ (await apiKey.save(key));

        return {
            status: result.status,
            message: result.message,
        };
    } catch (error) {
        console.error("❌ Failed to save API key:", error);
        return {
            status: 500,
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
        };
    }
});

/**
 * Update the UI domain view mode (compact/detailed).
 * @function updateUiView
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const updateUiView = form(uiViewSchema, async ({ viewMode }) => {
    try {
        const result = /** @type {ServiceResult} */ (
            await ui.saveViewMode(viewMode)
        );

        return {
            status: result.status,
            message: result.message,
        };
    } catch (error) {
        console.error("❌ Failed to update view mode:", error);
        return {
            status: 500,
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
        };
    }
});

/**
 * Enable/disable Slack notifications.
 * @function updateSlackEnabled
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const updateSlackEnabled = form(toggleFormSchema, async ({ enabled }) => {
    try {
        const result = /** @type {ServiceResult} */ (
            await slack.saveNotificationStatus(enabled)
        );

        return {
            status: result.status,
            message: result.message,
        };
    } catch (error) {
        console.error("❌ Failed to update Slack notifications:", error);
        return {
            status: 500,
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
        };
    }
});

/**
 * Update the Slack webhook configuration (optionally sending a test message).
 * @function updateSlackWebhook
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const updateSlackWebhook = form(
    slackWebhookSchema,
    async ({ webhook, notificationTime, sendTestMessage }) => {
        try {
            const result = /** @type {ServiceResult} */ (
                await slack.saveWebhook(webhook, notificationTime, {
                    shouldTestConnection: sendTestMessage,
                })
            );

            return {
                status: result.status,
                message: result.message,
            };
        } catch (error) {
            console.error("❌ Failed to save Slack webhook:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    }
);

/**
 * Enable/disable Resend email notifications.
 * @function updateResendEnabled
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const updateResendEnabled = form(
    toggleFormSchema,
    async ({ enabled }) => {
        try {
            const result = /** @type {ServiceResult} */ (
                await resend.saveNotificationStatus(enabled)
            );

            return {
                status: result.status,
                message: result.message,
            };
        } catch (error) {
            console.error("❌ Failed to update Resend notifications:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    }
);

/**
 * Update the Resend configuration (optionally sending a test email).
 * @function updateResendConfig
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const updateResendConfig = form(
    resendSchema,
    async ({ apiKey: key, fromEmail, toEmail, notificationTime, sendTestMessage }) => {
        try {
            const result = /** @type {ServiceResult} */ (
                await resend.saveConfig(key, fromEmail, toEmail, notificationTime, {
                    shouldTestConnection: sendTestMessage,
                })
            );

            return {
                status: result.status,
                message: result.message,
            };
        } catch (error) {
            console.error("❌ Failed to save Resend config:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    }
);
