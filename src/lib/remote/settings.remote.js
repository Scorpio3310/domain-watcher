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
    domainProviderSchema,
    uiViewSchema,
    toggleFormSchema,
    slackWebhookSchema,
    discordWebhookSchema,
    resendSchema,
} from "$src/routes/settings/validation";
import { apiKey } from "$src/lib/server/infrastructure/api-key";
import { ui, domainProvider } from "$src/lib/server/services/settings";
import { DOMAIN_PROVIDER } from "$lib/constants/constants";
import { slack } from "$src/lib/server/infrastructure/slack-client";
import { discord } from "$src/lib/server/infrastructure/discord-client";
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
        // Pin the currently-effective provider before the key exists —
        // otherwise saving a key on a fresh install would silently flip the
        // resolved default from RDAP to WhoisJSON (the keyed-install default
        // exists only for installs that predate the provider setting).
        const providerConfig = await domainProvider.getConfig();
        if (providerConfig.provider === null) {
            const hadKeyBefore = await apiKey.isConfigured();
            await domainProvider.save(
                hadKeyBefore
                    ? DOMAIN_PROVIDER.WHOIS_JSON
                    : DOMAIN_PROVIDER.RDAP,
                providerConfig.whoisjsonFallback
            );
        }

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
 * Update the domain lookup provider (rdap/whoisjson).
 * @function updateDomainProvider
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const updateDomainProvider = form(
    domainProviderSchema,
    async ({ provider, whoisjsonFallback }) => {
        try {
            if (
                provider === DOMAIN_PROVIDER.WHOIS_JSON &&
                !(await apiKey.isConfigured())
            ) {
                return {
                    status: 400,
                    message:
                        "Add a WhoisJSON API key before selecting WhoisJSON as the provider 🔑",
                };
            }

            const result = /** @type {ServiceResult} */ (
                await domainProvider.save(provider, whoisjsonFallback)
            );

            return {
                status: result.status,
                message: result.message,
            };
        } catch (error) {
            console.error("❌ Failed to update domain provider:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    }
);

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
 * Enable/disable Discord notifications.
 * @function updateDiscordEnabled
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const updateDiscordEnabled = form(
    toggleFormSchema,
    async ({ enabled }) => {
        try {
            const result = /** @type {ServiceResult} */ (
                await discord.saveNotificationStatus(enabled)
            );

            return {
                status: result.status,
                message: result.message,
            };
        } catch (error) {
            console.error("❌ Failed to update Discord notifications:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    }
);

/**
 * Update the Discord webhook configuration (optionally sending a test message).
 * @function updateDiscordWebhook
 * @memberof module:SettingsRemote
 * @returns {Promise<ServiceResult>}
 */
export const updateDiscordWebhook = form(
    discordWebhookSchema,
    async ({ webhook, notificationTime, sendTestMessage }) => {
        try {
            const result = /** @type {ServiceResult} */ (
                await discord.saveWebhook(webhook, notificationTime, {
                    shouldTestConnection: sendTestMessage,
                })
            );

            return {
                status: result.status,
                message: result.message,
            };
        } catch (error) {
            console.error("❌ Failed to save Discord webhook:", error);
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
