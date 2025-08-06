import { executeSql } from "$lib/database/db.js";
import { SETTINGS_QUERIES } from "$lib/database/settings-queries.js";
import { domainVerification } from "../services/domain.js";
import {
    getCurrentTimeInTimezone,
    formatHumanDate,
} from "$lib/utils/helpers.js";

// ============================================================================
// NOTIFICATION PROVIDERS REGISTRY
// ============================================================================

import { slackNotifier } from "./providers/slack-notifier.js";
import { resendNotifier } from "./providers/resend-notifier.js";

/**
 * Configuration registry for notification providers
 * @typedef {Object} ProviderConfig
 * @property {string} name - Human-readable provider name
 * @property {string} query - Database query key for settings
 * @property {Object} service - Notification service implementation
 * @property {Function} validate - Validation function for provider settings
 */
const PROVIDERS = {
    slack: {
        name: "Slack",
        query: "SELECT_SLACK_SETTINGS",
        service: slackNotifier,
        validate: (s) => !!s.webhook_url,
    },
    resend: {
        name: "Resend Email",
        query: "SELECT_RESEND_SETTINGS",
        service: resendNotifier,
        validate: (s) => !!(s.api_key && s.to_email && s.from_email),
    },
};

// ============================================================================
// CORE SERVICE
// ============================================================================

/**
 * Smart notification system for domain monitoring
 *
 * Handles scheduled and manual notification sending with intelligent domain verification.
 * Only verifies domains when notifications are due, respecting API rate limits.
 */
export const cronNotifications = {
    /**
     * Main entry point - orchestrates domain checking and notification sending
     *
     * @param {boolean} [force=false] - Bypass time checking and force execution
     * @returns {Promise<Object>} Execution results with timing and notification details
     * @returns {string} returns.timestamp - ISO timestamp of execution
     * @returns {string} returns.timestampLocal - Human-readable local timestamp
     * @returns {string} returns.action - "skipped" or "executed"
     * @returns {string} [returns.reason] - Reason for skipping (if action is "skipped")
     * @returns {Object} [returns.domains] - Domain verification results (if executed)
     * @returns {number} returns.domains.checked - Total domains verified
     * @returns {number} returns.domains.available - Count of available domains
     * @returns {number} returns.domains.expiring - Count of expiring domains
     * @returns {number} returns.domains.expired - Count of expired domains
     * @returns {Object} [returns.notifications] - Notification sending results
     * @returns {number} returns.notifications.sent - Successfully sent notifications
     * @returns {string[]} returns.notifications.providers - Provider keys that succeeded
     * @returns {Object[]} [returns.notifications.errors] - Provider errors if any occurred
     *
     * @example
     * // Regular scheduled execution
     * const result = await cronNotifications.checkAndSend();
     *
     * @example
     * // Force execution for testing
     * const result = await cronNotifications.checkAndSend(true);
     *
     * @throws {Error} Domain verification or notification sending failures
     */
    async checkAndSend(force = false) {
        const currentTime = getCurrentTimeInTimezone();
        console.log(`🕐 Check at: ${currentTime} ${force ? "(FORCED)" : ""}`);

        try {
            // Get providers to send to
            const providersToSend = await this.getProviders(currentTime, force);

            const baseResponse = {
                timestamp: new Date().toISOString(),
                timestampLocal: formatHumanDate(new Date().toISOString()),
            };

            if (providersToSend.length === 0) {
                return {
                    ...baseResponse,
                    action: "skipped",
                    reason: "No providers scheduled",
                };
            }

            // First get domain data, then send notifications
            console.log("🔍 Checking domains...");
            const domains = await this.checkDomains();

            console.log("📨 Sending notifications...");
            const notifications = await this.sendNotifications(
                providersToSend,
                domains,
                force
            );

            return {
                ...baseResponse,
                action: "executed",
                domains: {
                    checked: domains.checked,
                    available: domains.available.length,
                    expiring: domains.expiring.length,
                    expired: domains.expired.length,
                },
                notifications,
            };
        } catch (error) {
            console.error("❌ Notification failed:", error);
            throw error;
        }
    },

    /**
     * Determines which notification providers should send notifications
     *
     * For scheduled mode: only includes providers with matching notification times
     * For forced mode: includes all enabled providers regardless of time
     *
     * @param {string} currentTime - Current time in HH:MM format
     * @param {boolean} [force=false] - Bypass time checking for all enabled providers
     * @returns {Promise<Object[]>} Array of provider configurations to use
     * @returns {string} returns[].key - Provider key (slack, resend, etc.)
     * @returns {string} returns[].name - Human-readable provider name
     * @returns {Object} returns[].service - Provider service implementation
     * @returns {Object} returns[].settings - Provider configuration settings
     *
     * @example
     * // Get providers for current time
     * const providers = await cronNotifications.getProviders("14:30");
     *
     * @example
     * // Get all enabled providers
     * const providers = await cronNotifications.getProviders("14:30", true);
     */
    async getProviders(currentTime, force = false) {
        const providers = [];

        for (const [key, config] of Object.entries(PROVIDERS)) {
            const settings = await this.getSettings(key);

            if (!settings.enabled) {
                console.log(`⏭️ ${config.name} disabled`);
                continue;
            }

            // For forced mode, include all enabled providers
            // For scheduled mode, only include providers with matching time
            if (force || settings.notification_time === currentTime) {
                console.log(
                    `✅ ${config.name} selected ${
                        force ? "(forced)" : `(time: ${currentTime})`
                    }`
                );
                providers.push({ key, ...config, settings });
            } else {
                console.log(
                    `⏭️ ${config.name} time mismatch (${settings.notification_time} vs ${currentTime})`
                );
            }
        }

        return providers;
    },

    /**
     * Performs intelligent domain verification in parallel
     *
     * Handles three types of domain checks:
     * 1. Expired registered domains - verifies if they became available
     * 2. Regular domains - standard availability verification
     * 3. Expiring domains - fetches domains approaching expiration
     *
     * @returns {Promise<Object>} Comprehensive domain verification results
     * @returns {number} returns.checked - Total number of domains verified via API
     * @returns {Object[]} returns.available - Domains that became available
     * @returns {Object[]} returns.expiring - Domains approaching expiration
     * @returns {Object[]} returns.expired - Domains that are expired but still registered
     *
     * @example
     * const results = await cronNotifications.checkDomains();
     * console.log(`Checked ${results.checked} domains, found ${results.available.length} available`);
     */
    async checkDomains() {
        // Get all domain data in parallel
        const [expiredRegistered, domainsToCheck, expiringDomains] =
            await Promise.all([
                domainVerification.getExpiredRegisteredDomains(),
                domainVerification.getDomainsNeedingVerification(),
                domainVerification.getExpiringDomains(),
            ]);

        // Verify domains in parallel (if any exist)
        const verificationPromises = [];

        if (expiredRegistered.length > 0) {
            console.log(
                `🚨 Verifying ${expiredRegistered.length} expired domains...`
            );
            verificationPromises.push(
                domainVerification.verifyExpiredDomainsBatch(expiredRegistered)
            );
        } else {
            verificationPromises.push(
                Promise.resolve({
                    checked: 0,
                    available: [],
                    stillRegistered: [],
                })
            );
        }

        if (domainsToCheck.length > 0) {
            console.log(
                `📊 Verifying ${domainsToCheck.length} regular domains...`
            );
            verificationPromises.push(
                domainVerification.verifyDomainsBatch(domainsToCheck)
            );
        } else {
            verificationPromises.push(
                Promise.resolve({ checked: 0, available: [] })
            );
        }

        const [expiredResults, verificationResults] = await Promise.all(
            verificationPromises
        );

        const results = {
            checked:
                (expiredResults.checked || 0) +
                (verificationResults.checked || 0),
            available: [
                ...(expiredResults.available || []),
                ...(verificationResults.available || []),
            ],
            expiring: expiringDomains,
            expired: expiredResults.stillRegistered || [],
        };

        console.log(
            `✅ Domains: ${results.checked} checked, ${results.available.length} available, ${results.expired.length} expired, ${results.expiring.length} expiring`
        );
        return results;
    },

    /**
     * Sends domain reports to all configured notification providers
     *
     * Validates each provider configuration before sending and handles failures gracefully.
     * Sends notifications in parallel for better performance.
     *
     * @param {Object[]} providers - Array of provider configurations from getProviders()
     * @param {Object} domains - Domain verification results from checkDomains()
     * @param {Object[]} domains.available - Domains that became available
     * @param {Object[]} domains.expiring - Domains approaching expiration
     * @param {Object[]} domains.expired - Expired domains still registered
     * @returns {Promise<Object>} Notification sending results
     * @returns {number} returns.sent - Number of successful notifications sent
     * @returns {string[]} returns.providers - Array of provider keys that succeeded
     * @returns {Object[]} [returns.errors] - Array of provider errors (only if errors occurred)
     * @returns {string} returns.errors[].provider - Provider key that failed
     * @returns {string} returns.errors[].error - Error message
     *
     * @example
     * const providers = await cronNotifications.getProviders("14:30");
     * const domains = await cronNotifications.checkDomains();
     * const results = await cronNotifications.sendNotifications(providers, domains);
     *
     * @throws {Error} Individual provider failures are captured and returned in results.errors
     */
    async sendNotifications(providers, domains) {
        const totalCount =
            domains.available.length +
            domains.expiring.length +
            domains.expired.length;

        // Always send notifications, even if no domains to report
        if (totalCount === 0) {
            console.log(
                "📭 No domain updates today - sending 'all quiet' notification"
            );
        }

        const results = { sent: 0, providers: [], errors: [] };

        console.log(`📨 Sending to ${providers.length} provider(s)...`);

        // Send to all providers in parallel
        const sendPromises = providers.map(async (provider) => {
            try {
                if (!provider.validate(provider.settings)) {
                    console.log(`⚠️ ${provider.name} not configured`);
                    return null;
                }

                const result = await provider.service.sendDomainReport(
                    provider.settings,
                    {
                        available: domains.available,
                        expiring: domains.expiring,
                        expired: domains.expired,
                        totalCount,
                    }
                );

                if (result.success) {
                    console.log(`✅ ${provider.name} sent`);
                    return { key: provider.key, success: true };
                } else {
                    console.log(
                        `❌ ${provider.name} failed: ${result.message}`
                    );
                    return {
                        key: provider.key,
                        success: false,
                        error: result.message,
                    };
                }
            } catch (error) {
                console.error(`❌ ${provider.name} error:`, error);
                return {
                    key: provider.key,
                    success: false,
                    error: error.message,
                };
            }
        });

        const sendResults = await Promise.all(sendPromises);

        // Collect results
        sendResults.forEach((result) => {
            if (result) {
                if (result.success) {
                    results.sent++;
                    results.providers.push(result.key);
                } else {
                    results.errors.push({
                        provider: result.key,
                        error: result.error,
                    });
                }
            }
        });

        return results.errors.length > 0
            ? { ...results, errors: results.errors }
            : { sent: results.sent, providers: results.providers };
    },

    /**
     * Retrieves and parses notification provider settings from database
     *
     * @param {string} providerKey - Provider key (must exist in PROVIDERS registry)
     * @returns {Promise<Object>} Provider settings with enabled status
     * @returns {boolean} returns.enabled - Whether the provider is enabled
     * @returns {*} returns... - Additional provider-specific settings from database
     *
     * @example
     * const slackSettings = await cronNotifications.getSettings("slack");
     * if (slackSettings.enabled && slackSettings.webhook_url) {
     *   // Slack is configured and ready
     * }
     *
     * @throws {Error} Database or JSON parsing errors are logged and return {enabled: false}
     */
    async getSettings(providerKey) {
        try {
            const config = PROVIDERS[providerKey];
            const result = await executeSql(SETTINGS_QUERIES[config.query]);
            const settings = result?.results?.[0];

            if (!settings) return { enabled: false };

            const parsed = settings.json_config_data
                ? JSON.parse(settings.json_config_data)
                : {};
            return { enabled: settings.enabled === 1, ...parsed };
        } catch (error) {
            console.error(`❌ Error getting ${providerKey} settings:`, error);
            return { enabled: false };
        }
    },
};
