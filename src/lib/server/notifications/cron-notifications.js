import { executeSql } from "$lib/database/db.js";
import { SETTINGS_QUERIES } from "$lib/database/settings-queries.js";
import { domainVerification } from "../services/domain.js";
import {
    getCurrentTimeInTimezone,
    formatHumanDate,
    getErrorMessage,
} from "$lib/utils/helpers.js";

/** @import { CheckFailure, DomainRecord, ProviderSettings, SlackConfig, DiscordConfig, ResendConfig } from "$lib/types" */

// ============================================================================
// NOTIFICATION PROVIDERS REGISTRY
// ============================================================================

import { slackNotifier } from "./providers/slack-notifier.js";
import { discordNotifier } from "./providers/discord-notifier.js";
import { resendNotifier } from "./providers/resend-notifier.js";

/**
 * Configuration registry entry for a notification provider
 * @typedef {Object} ProviderConfig
 * @property {string} name - Human-readable provider name
 * @property {keyof typeof SETTINGS_QUERIES} query - Database query key for settings
 * @property {typeof slackNotifier | typeof discordNotifier | typeof resendNotifier} service - Notification service implementation
 * @property {(settings: ProviderSettings) => boolean} validate - Validation function for provider settings
 */

/**
 * Provider selected for sending, including its loaded settings
 * @typedef {ProviderConfig & {key: string, settings: ProviderSettings}} ActiveProvider
 */

/**
 * Aggregated result of sending notifications to all selected providers
 * @typedef {Object} NotificationSendResult
 * @property {number} sent - Number of successful notifications sent
 * @property {string[]} providers - Provider keys that succeeded
 * @property {Array<{provider: string, error?: string}>} [errors] - Provider errors (only present if errors occurred)
 */

/**
 * Domain verification results gathered for notifications.
 * Section lists reflect post-check DB state (failed checks preserve the last
 * known status), while failures come from this run's live batch results.
 * @typedef {Object} DomainCheckResult
 * @property {number} checked - Total number of domains verified via API
 * @property {DomainRecord[]} available - Domains currently available
 * @property {DomainRecord[]} expiring - Domains approaching expiration
 * @property {DomainRecord[]} expired - Domains that are expired but still registered
 * @property {CheckFailure[]} failures - Checks that failed in this run
 */

/**
 * Result of a cron notification run
 * @typedef {Object} CronExecutionResult
 * @property {string} timestamp - ISO timestamp of execution
 * @property {string|null} timestampLocal - Human-readable local timestamp
 * @property {"skipped"|"executed"} action - Whether the run executed or was skipped
 * @property {string} [reason] - Reason for skipping (if action is "skipped")
 * @property {Array<{provider: string, error: string}>} [settingsErrors] - Provider settings that failed to load/parse (so a DB error is distinguishable from "provider disabled")
 * @property {{checked: number, available: number, expiring: number, expired: number, failed: number}} [domains] - Domain verification counts (if executed)
 * @property {NotificationSendResult} [notifications] - Notification sending results (if executed)
 */

/** @type {Record<string, ProviderConfig>} */
const PROVIDERS = {
    slack: {
        name: "Slack",
        query: "SELECT_SLACK_SETTINGS",
        service: slackNotifier,
        validate: (s) => !!s.webhook_url,
    },
    discord: {
        name: "Discord",
        query: "SELECT_DISCORD_SETTINGS",
        service: discordNotifier,
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
     * @returns {Promise<CronExecutionResult>} Execution results with timing and notification details
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
            const { providers: providersToSend, settingsErrors } =
                await this.getProviders(currentTime, force);

            const baseResponse = {
                timestamp: new Date().toISOString(),
                timestampLocal: formatHumanDate(new Date().toISOString()),
                ...(settingsErrors.length > 0 && { settingsErrors }),
            };

            if (providersToSend.length === 0) {
                return {
                    ...baseResponse,
                    action: "skipped",
                    reason:
                        settingsErrors.length > 0
                            ? "No providers scheduled (some provider settings failed to load)"
                            : "No providers scheduled",
                };
            }

            // First get domain data, then send notifications
            console.log("🔍 Checking domains...");
            const domains = await this.checkDomains();

            console.log("📨 Sending notifications...");
            const notifications = await this.sendNotifications(
                providersToSend,
                domains
            );

            return {
                ...baseResponse,
                action: "executed",
                domains: {
                    checked: domains.checked,
                    available: domains.available.length,
                    expiring: domains.expiring.length,
                    expired: domains.expired.length,
                    failed: domains.failures.length,
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
     * @returns {Promise<{providers: ActiveProvider[], settingsErrors: Array<{provider: string, error: string}>}>} Providers to use plus any settings load failures
     *
     * @example
     * // Get providers for current time
     * const { providers } = await cronNotifications.getProviders("14:30");
     *
     * @example
     * // Get all enabled providers
     * const { providers } = await cronNotifications.getProviders("14:30", true);
     */
    async getProviders(currentTime, force = false) {
        /** @type {ActiveProvider[]} */
        const providers = [];
        /** @type {Array<{provider: string, error: string}>} */
        const settingsErrors = [];

        for (const [key, config] of Object.entries(PROVIDERS)) {
            const settings = await this.getSettings(key);

            if (settings.error) {
                console.error(
                    `❌ ${config.name} settings failed to load: ${settings.error}`
                );
                settingsErrors.push({ provider: key, error: settings.error });
                continue;
            }

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

        return { providers, settingsErrors };
    },

    /**
     * Performs intelligent domain verification in parallel
     *
     * Handles three types of domain checks:
     * 1. Expired registered domains - verifies if they became available
     * 2. Regular domains - standard availability verification
     * 3. Expiring domains - fetches domains approaching expiration
     *
     * Report sections are read back from DB state AFTER the verification
     * batches: failed checks preserve the last known status, so a transient
     * lookup/DB failure can't silently drop a domain from the daily report.
     * The failures list comes from this run's live batch results.
     *
     * @returns {Promise<DomainCheckResult>} Comprehensive domain verification results
     *
     * @example
     * const results = await cronNotifications.checkDomains();
     * console.log(`Checked ${results.checked} domains, found ${results.available.length} available`);
     */
    async checkDomains() {
        // ONE unified SELECT, partitioned in JS (was 3 identical queries)
        const { expiredRegistered, needingVerification } =
            await domainVerification.getAllDomainsForVerification();

        // Verify domains in parallel (if any exist)
        if (expiredRegistered.length > 0) {
            console.log(
                `🚨 Verifying ${expiredRegistered.length} expired domains...`
            );
        }
        if (needingVerification.length > 0) {
            console.log(
                `📊 Verifying ${needingVerification.length} regular domains...`
            );
        }

        const [expiredResults, verificationResults] = await Promise.all([
            expiredRegistered.length > 0
                ? domainVerification.verifyExpiredDomainsBatch(
                      expiredRegistered
                  )
                : null,
            needingVerification.length > 0
                ? domainVerification.verifyDomainsBatch(needingVerification)
                : null,
        ]);

        // Post-check DB state drives the report sections
        const reportState = await domainVerification.getDomainReportState();

        /** @type {DomainCheckResult} */
        const results = {
            checked:
                (expiredResults?.checked ?? 0) +
                (verificationResults?.checked ?? 0),
            available: reportState.available,
            expiring: reportState.expiring,
            expired: reportState.expired,
            failures: [
                ...(expiredResults?.failures ?? []),
                ...(verificationResults?.failures ?? []),
            ],
        };

        console.log(
            `✅ Domains: ${results.checked} checked, ${results.available.length} available, ${results.expired.length} expired, ${results.expiring.length} expiring, ${results.failures.length} failed`
        );
        return results;
    },

    /**
     * Sends domain reports to all configured notification providers
     *
     * Validates each provider configuration before sending and handles failures gracefully.
     * Sends notifications in parallel for better performance.
     *
     * @param {ActiveProvider[]} providers - Array of provider configurations from getProviders()
     * @param {DomainCheckResult} domains - Domain verification results from checkDomains()
     * @returns {Promise<NotificationSendResult>} Notification sending results
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
        if (totalCount === 0 && domains.failures.length === 0) {
            console.log(
                "📭 No domain updates today - sending 'all quiet' notification"
            );
        }

        /** @type {{sent: number, providers: string[], errors: Array<{provider: string, error?: string}>}} */
        const results = { sent: 0, providers: [], errors: [] };

        console.log(`📨 Sending to ${providers.length} provider(s)...`);

        // Send to all providers in parallel
        /** @type {Array<Promise<{key: string, success: boolean, error?: string} | null>>} */
        const sendPromises = providers.map(async (provider) => {
            try {
                if (!provider.validate(provider.settings)) {
                    console.log(`⚠️ ${provider.name} not configured`);
                    return null;
                }

                const result = await provider.service.sendDomainReport(
                    /** @type {ProviderSettings & SlackConfig & DiscordConfig & ResendConfig} */ (
                        provider.settings
                    ),
                    {
                        available: domains.available,
                        expiring: domains.expiring,
                        expired: domains.expired,
                        failures: domains.failures,
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
                    error: getErrorMessage(error),
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
     * Never throws - database or JSON parsing errors are logged and returned as
     * {enabled: false, error} so callers can distinguish a failure from a disabled provider.
     *
     * @param {string} providerKey - Provider key (must exist in PROVIDERS registry)
     * @returns {Promise<ProviderSettings>} Provider settings with enabled status
     *
     * @example
     * const slackSettings = await cronNotifications.getSettings("slack");
     * if (slackSettings.enabled && slackSettings.webhook_url) {
     *   // Slack is configured and ready
     * }
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
            return { enabled: false, error: getErrorMessage(error) };
        }
    },
};
