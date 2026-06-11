/** @import { ServiceResult, DiscordConfig } from '$lib/types' */

import { executeSql } from "$src/lib/database/db";
import { SETTINGS_QUERIES } from "$src/lib/database/settings-queries";
import { isDemo } from "$src/lib/utils/helpers";
import { DISCORD_CONNECTION_STATUS } from "$lib/constants/constants";
import { getErrorMessage, maskApiKey } from "$lib/utils/helpers";
import { validateDemoMode } from "$src/lib/server/utils/access";

// ========================================
// CORE UTILITIES
// ========================================
/**
 * Creates Discord configuration object
 * @param {Object} [values={}] - Configuration values
 * @param {string} [values.webhookUrl] - Discord webhook URL
 * @param {string} [values.notificationTime] - Notification time (HH:mm)
 * @param {string} [values.connectionStatus] - Connection test status
 * @param {string|null} [values.verifiedAt] - When the connection was verified
 * @param {number} [values.version] - Config schema version
 * @returns {DiscordConfig} Discord configuration object
 */
const createDiscordConfiguration = ({
    webhookUrl = "",
    notificationTime = "",
    connectionStatus = DISCORD_CONNECTION_STATUS.SETUP_REQUIRED,
    verifiedAt = null,
    version = 1,
} = {}) => ({
    webhook_url: webhookUrl,
    notification_time: notificationTime,
    connection_status: connectionStatus,
    connection_verified_at: verifiedAt,
    version,
});

// ========================================
// DISCORD WEBHOOK TESTING
// ========================================

/**
 * Tests Discord webhook by sending a test message
 * @async
 * @function testDiscordWebhook
 * @param {string} webhook - Discord webhook URL
 * @param {string} notificationTime - Notification time in HH:MM format
 * @returns {Promise<ServiceResult>} Success object or error object
 * @example
 * const result = await testDiscordWebhook(
 *   "https://discord.com/api/webhooks/...",
 *   "14:33"
 * );
 */
export async function testDiscordWebhook(webhook, notificationTime) {
    try {
        // Create test message
        const testMessage = {
            content: "🚀 Domain Watcher - Configuration Verified",
            embeds: [
                {
                    title: "Domain Watcher Test ✨",
                    description: `Your notifications just passed the vibe check!\n\n**Scheduled notification time:** ${notificationTime}\n\nIf you received this message, your webhook is working correctly! 🎉`,
                    color: 0x2ba805,
                },
            ],
        };

        // Send test message to Discord
        const response = await fetch(webhook, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(testMessage),
        });

        if (response.ok) {
            console.log("✅ Discord webhook test successful");
            return {
                status: 200,
                message: `Test message sent successfully to Discord!`,
            };
        } else {
            const errorText = await response.text();
            console.error(
                "❌ Discord webhook test failed:",
                response.status,
                errorText
            );
            return {
                status: response.status,
                message: `Discord API error: ${errorText}`,
            };
        }
    } catch (error) {
        console.error("❌ Failed to test Discord webhook:", error);
        return {
            status: 500,
            message: `Failed to test webhook: ${getErrorMessage(error)}`,
        };
    }
}

// ========================================
// DISCORD SETTINGS MANAGEMENT
// ========================================

/**
 * Discord integration management operations
 * @namespace discord
 */
export const discord = {
    /**
     * Gets Discord notification enabled status
     * @async
     * @memberof discord
     * @returns {Promise<boolean>} True if enabled, false otherwise
     *
     * @example
     * const enabled = await discord.getNotificationStatus();
     * // Returns: true or false
     */
    async getNotificationStatus() {
        try {
            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_DISCORD_SETTINGS
            );
            return queryResult?.results?.[0]?.enabled === 1;
        } catch (error) {
            console.error(
                "❌ Failed to get Discord notification status:",
                error
            );
            return false;
        }
    },

    /**
     * Gets Discord webhook configuration with demo mode masking
     * @async
     * @memberof discord
     * @returns {Promise<DiscordConfig|null>} Webhook settings (masked in demo mode) or null
     *
     * @example
     * const config = await discord.getWebhookConfig();
     * // Demo mode: { webhook_url: "https://discord.com/api/webhooks/***", ... }
     * // Normal: { webhook_url: "https://discord.com/api/webhooks/1234/...", ... }
     */
    async getWebhookConfig() {
        try {
            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_DISCORD_SETTINGS
            );
            const discordSettings = queryResult?.results?.[0];

            const config = discordSettings?.json_config_data
                ? /** @type {DiscordConfig|null} */ (
                      JSON.parse(discordSettings.json_config_data || "{}")
                  )
                : null;

            if (!config) return null;

            // Apply demo mode masking directly in service
            if (isDemo() && config.webhook_url) {
                config.webhook_url = maskApiKey(config.webhook_url, 35);
            }

            return config;
        } catch (error) {
            console.error(
                "❌ Failed to get Discord webhook configuration:",
                error
            );
            return null;
        }
    },

    /**
     * Sets Discord notification enabled status
     * @async
     * @memberof discord
     * @param {boolean} isEnabled - Whether notifications should be enabled
     * @returns {Promise<ServiceResult>} Operation result
     *
     * @example
     * const result = await discord.saveNotificationStatus(true);
     * // Returns: { status: 200, message: "Discord notifications enabled" }
     */
    async saveNotificationStatus(isEnabled) {
        try {
            const demoAccessError = validateDemoMode();
            if (demoAccessError) return demoAccessError;

            const enabledValue = isEnabled ? 1 : 0;

            const updateResult = await executeSql(
                SETTINGS_QUERIES.UPDATE_DISCORD_ENABLED_ONLY,
                [enabledValue]
            );

            if ((updateResult?.meta?.changes ?? 0) > 0) {
                const statusMessage = isEnabled
                    ? "Discord notifications are now live and kicking! 🚀"
                    : "Discord notifications chilled out - no more pings 😴";
                return { status: 200, message: statusMessage };
            }

            const defaultDiscordConfiguration = createDiscordConfiguration();
            await executeSql(SETTINGS_QUERIES.UPSERT_DISCORD_SETTINGS, [
                JSON.stringify(defaultDiscordConfiguration),
                enabledValue,
            ]);

            return {
                status: 201,
                message: `Discord notifications enabled! 🎉 (Psst - don't forget to set your webhook in Settings)`,
            };
        } catch (error) {
            console.error(
                "❌ Failed to set Discord notification status:",
                error
            );
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    },

    /**
     * Saves and tests Discord webhook configuration
     * @async
     * @memberof discord
     * @param {string} webhookUrl - Discord webhook URL
     * @param {string} notificationTime - Notification time in HH:MM format
     * @param {Object} [options={}] - Configuration options
     * @param {boolean} [options.shouldTestConnection=true] - Whether to test the webhook
     * @returns {Promise<ServiceResult>} Operation result
     *
     * @example
     * // Test connection (default behavior)
     * const result = await discord.saveWebhook("https://discord.com/api/webhooks/...", "14:30");
     *
     * @example
     * // Save without testing
     * const result = await discord.saveWebhook("https://discord.com/api/webhooks/...", "14:30", {
     *   shouldTestConnection: false
     * });
     */
    async saveWebhook(webhookUrl, notificationTime, options = {}) {
        const { shouldTestConnection = true } = options;

        try {
            const demoAccessError = validateDemoMode();
            if (demoAccessError) return demoAccessError;

            const initialDiscordConfiguration = createDiscordConfiguration({
                webhookUrl,
                notificationTime,
                connectionStatus: DISCORD_CONNECTION_STATUS.READY,
            });

            await executeSql(SETTINGS_QUERIES.UPDATE_DISCORD_VALUE_ONLY, [
                JSON.stringify(initialDiscordConfiguration),
            ]);

            if (!shouldTestConnection) {
                return {
                    status: 201,
                    message:
                        "Discord Webhook saved! ⭐ Pro tip: Test it out to make sure everything's smooth",
                };
            }

            const webhookTestResult = await testDiscordWebhook(
                webhookUrl,
                notificationTime
            );
            const isConnectionSuccessful = webhookTestResult.status === 200;

            const finalDiscordConfiguration = createDiscordConfiguration({
                webhookUrl,
                notificationTime,
                connectionStatus: isConnectionSuccessful
                    ? DISCORD_CONNECTION_STATUS.CONNECTED
                    : DISCORD_CONNECTION_STATUS.DISCONNECTED,
                verifiedAt: new Date().toISOString(),
            });

            await executeSql(SETTINGS_QUERIES.UPDATE_DISCORD_VALUE_ONLY, [
                JSON.stringify(finalDiscordConfiguration),
            ]);

            const responseMessage = isConnectionSuccessful
                ? `Test message sent! Discord is ready to ping you at ${notificationTime} ⏰`
                : `Connection test stumbled: ${webhookTestResult.message} 🔧`;

            return {
                status: webhookTestResult.status,
                message: responseMessage,
            };
        } catch (error) {
            console.error(
                "❌ Failed to save Discord webhook configuration:",
                error
            );
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    },
};
