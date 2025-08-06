import { executeSql } from "$src/lib/database/db";
import { SETTINGS_QUERIES } from "$src/lib/database/settings-queries";
import { isDemo } from "$src/lib/utils/helpers";
import { SLACK_CONNECTION_STATUS } from "$lib/constants/constants";
import { maskApiKey } from "$lib/utils/helpers";

// ========================================
// CORE UTILITIES
// ========================================
/**
 * Validates demo mode for write operations
 */
const validateDemoAccess = () =>
    isDemo()
        ? { status: 403, message: "Demo mode: Look but don't touch 👀" }
        : null;

/**
 * Creates Slack configuration object
 */
const createSlackConfiguration = ({
    webhookUrl = "",
    notificationTime = "",
    connectionStatus = SLACK_CONNECTION_STATUS.SETUP_REQUIRED,
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
// SLACK WEBHOOK TESTING
// ========================================

/**
 * Tests Slack webhook by sending a test message
 * @async
 * @function testSlackWebhook
 * @param {string} webhook - Slack webhook URL
 * @param {string} notificationTime - Notification time in HH:MM format
 * @returns {Promise<Object>} Success object or error object
 * @example
 * const result = await testSlackWebhook(
 *   "https://hooks.slack.com/services/...",
 *   "14:33"
 * );
 */
export async function testSlackWebhook(webhook, notificationTime) {
    try {
        // Create test message
        const testMessage = {
            text: "🚀 Domain Watcher - Configuration Verified",
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*Domain Watcher Test ✨*\n\nYour notifications just passed the vibe check!\nThis notification was sent at ${new Date().toLocaleString()}\n\n*Scheduled notification time:* ${notificationTime}`,
                    },
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: "If you received this message, your webhook is working correctly! 🎉",
                        },
                    ],
                },
            ],
        };

        // Send test message to Slack
        const response = await fetch(webhook, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(testMessage),
        });

        if (response.ok) {
            console.log("✅ Slack webhook test successful");
            return {
                status: 200,
                message: `Test message sent successfully to Slack!`,
            };
        } else {
            const errorText = await response.text();
            console.error(
                "❌ Slack webhook test failed:",
                response.status,
                errorText
            );
            return {
                status: response.status,
                message: `Slack API error: ${errorText}`,
            };
        }
    } catch (error) {
        console.error("❌ Failed to test Slack webhook:", error);
        return {
            status: 500,
            message: `Failed to test webhook: ${error.message}`,
        };
    }
}

// ========================================
// SLACK SETTINGS MANAGEMENT
// ========================================

/**
 * Slack integration management operations
 * @namespace slack
 */
export const slack = {
    /**
     * Gets Slack notification enabled status
     * @async
     * @memberof slack
     * @returns {Promise<boolean>} True if enabled, false otherwise
     *
     * @example
     * const enabled = await slack.getNotificationStatus();
     * // Returns: true or false
     */
    async getNotificationStatus() {
        try {
            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_SLACK_SETTINGS
            );
            return queryResult?.results?.[0]?.enabled === 1;
        } catch (error) {
            console.error("❌ Failed to get Slack notification status:", error);
            return false;
        }
    },

    /**
     * Gets Slack webhook configuration with demo mode masking
     * @async
     * @memberof slack
     * @returns {Promise<Object>} Webhook settings (masked in demo mode)
     *
     * @example
     * const getWebhookConfig = await slack.getWebhookConfig();
     * // Demo mode: { webhook_url: "https://hooks.slack.com/services/***", ... }
     * // Normal: { webhook_url: "https://hooks.slack.com/services/T05Q3ABS0JC/...", ... }
     */
    async getWebhookConfig() {
        try {
            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_SLACK_SETTINGS
            );
            const slackSettings = queryResult?.results?.[0];

            const config = slackSettings?.json_config_data
                ? JSON.parse(slackSettings.json_config_data || "{}") || {}
                : {};

            // Apply demo mode masking directly in service
            if (isDemo() && config.webhook_url) {
                config.webhook_url = maskApiKey(config.webhook_url, 30);
            }

            return config;
        } catch (error) {
            console.error(
                "❌ Failed to get Slack webhook configuration:",
                error
            );
            return {};
        }
    },

    /**
     * Sets Slack notification enabled status
     * @async
     * @memberof slack
     * @param {boolean} isEnabled - Whether notifications should be enabled
     * @returns {Promise<Object>} Operation result
     *
     * @example
     * const result = await slack.saveNotificationStatus(true);
     * // Returns: { status: 200, message: "Slack notifications enabled" }
     */
    async saveNotificationStatus(isEnabled) {
        try {
            const demoAccessError = validateDemoAccess();
            if (demoAccessError) return demoAccessError;

            const enabledValue = isEnabled ? 1 : 0;

            const updateResult = await executeSql(
                SETTINGS_QUERIES.UPDATE_SLACK_ENABLED_ONLY,
                [enabledValue]
            );

            if (updateResult?.meta?.changes > 0) {
                const statusMessage = isEnabled
                    ? "Slack notifications are now live and kicking! 🚀"
                    : "Slack notifications chilled out - no more pings 😴";
                return { status: 200, message: statusMessage };
            }

            const defaultSlackConfiguration = createSlackConfiguration();
            await executeSql(SETTINGS_QUERIES.UPSERT_SLACK_SETTINGS, [
                JSON.stringify(defaultSlackConfiguration),
                enabledValue,
            ]);

            return {
                status: 201,
                message: `Slack notifications enabled! 🎉 (Psst - don't forget to set your webhook in Settings)`,
            };
        } catch (error) {
            console.error("❌ Failed to set Slack notification status:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${error.message}`,
            };
        }
    },

    /**
     * Saves and tests Slack webhook configuration
     * @async
     * @memberof slack
     * @param {string} webhookUrl - Slack webhook URL
     * @param {string} notificationTime - Notification time in HH:MM format
     * @param {Object} [options={}] - Configuration options
     * @param {boolean} [options.shouldTestConnection=true] - Whether to test the webhook
     * @returns {Promise<Object>} Operation result
     *
     * @example
     * // Test connection (default behavior)
     * const result = await slack.saveWebhook("https://hooks.slack.com/...", "14:30");
     *
     * @example
     * // Save without testing
     * const result = await slack.saveWebhook("https://hooks.slack.com/...", "14:30", {
     *   shouldTestConnection: false
     * });
     *
     * @example
     * // Explicit test (same as default)
     * const result = await slack.saveWebhook("https://hooks.slack.com/...", "14:30", {
     *   shouldTestConnection: true
     * });
     */
    async saveWebhook(webhookUrl, notificationTime, options = {}) {
        const { shouldTestConnection = true } = options;

        try {
            const demoAccessError = validateDemoAccess();
            if (demoAccessError) return demoAccessError;

            const initialSlackConfiguration = createSlackConfiguration({
                webhookUrl,
                notificationTime,
                connectionStatus: SLACK_CONNECTION_STATUS.READY,
            });

            await executeSql(SETTINGS_QUERIES.UPDATE_SLACK_VALUE_ONLY, [
                JSON.stringify(initialSlackConfiguration),
            ]);

            if (!shouldTestConnection) {
                return {
                    status: 201,
                    message:
                        "Slack Webhook saved! ⭐ Pro tip: Test it out to make sure everything's smooth",
                };
            }

            const webhookTestResult = await testSlackWebhook(
                webhookUrl,
                notificationTime
            );
            const isConnectionSuccessful = webhookTestResult.status === 200;

            const finalSlackConfiguration = createSlackConfiguration({
                webhookUrl,
                notificationTime,
                connectionStatus: isConnectionSuccessful
                    ? SLACK_CONNECTION_STATUS.CONNECTED
                    : SLACK_CONNECTION_STATUS.DISCONNECTED,
                verifiedAt: new Date().toISOString(),
            });

            await executeSql(SETTINGS_QUERIES.UPDATE_SLACK_VALUE_ONLY, [
                JSON.stringify(finalSlackConfiguration),
            ]);

            const responseMessage = isConnectionSuccessful
                ? `Test message sent! Slack is ready to ping you at ${notificationTime} ⏰`
                : `Connection test stumbled: ${webhookTestResult.message} 🔧`;

            return {
                status: webhookTestResult.status,
                message: responseMessage,
            };
        } catch (error) {
            console.error(
                "❌ Failed to save Slack webhook configuration:",
                error
            );
            return {
                status: 500,
                message: `Houston, we have a problem: ${error.message}`,
            };
        }
    },
};
