import { executeSql } from "#lib/database/db.js";
import { SETTINGS_QUERIES } from "#lib/database/settings-queries.js";
import { domainVerification } from "../services/domain.js";
import { planVerification } from "#lib/server/services/verification-plan.js";
import { CONFIG } from "#lib/server/utils/domain-utils.js";
import {
    addDaysToDate,
    getScheduleDecision,
} from "#lib/server/utils/notification-utils.js";
import { NOTIFICATION_CATCH_UP_MINUTES } from "#lib/constants/constants.js";
import {
    isDiscordWebhookUrl,
    isSlackWebhookUrl,
} from "#src/routes/settings/validation.js";
import {
    getLocalDateTime,
    getTimezone,
    formatHumanDate,
    getErrorMessage,
} from "#lib/utils/helpers.js";

/** @import { CheckFailure, DomainRecord, ProviderSettings, ScheduleDecision, SlackConfig, DiscordConfig, ResendConfig } from "#lib/types.js" */

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
 * @property {(settings: ProviderSettings) => boolean} validate - Whether the provider is fully configured (checked before selecting it)
 * @property {string} missing - What is missing when validate fails (for logs)
 */

/**
 * Provider selected for sending, including its loaded settings. Scheduled
 * runs also carry the report slot (local date) the provider is due for.
 * @typedef {ProviderConfig & {key: string, settings: ProviderSettings, slotDate?: string}} ActiveProvider
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
 * known status). Failures are this run's live batch results plus the domains
 * whose latest check failed within the last 12 hours (see mergeFailures).
 * @typedef {Object} DomainCheckResult
 * @property {number} checked - Total number of domains verified via API
 * @property {number} deferred - Domains due for a check but left for later runs by the per-run cap
 * @property {DomainRecord[]} available - Domains currently available
 * @property {DomainRecord[]} expiring - Domains approaching expiration
 * @property {DomainRecord[]} expired - Domains that are expired but still registered
 * @property {CheckFailure[]} failures - Checks that failed in this run or within the last 12 hours
 */

/**
 * Result of a cron notification run
 * @typedef {Object} CronExecutionResult
 * @property {string} timestamp - ISO timestamp of execution
 * @property {string|null} timestampLocal - Human-readable local timestamp
 * @property {"skipped"|"executed"} action - Whether the run executed or was skipped
 * @property {string} [reason] - Reason for skipping (if action is "skipped")
 * @property {Array<{provider: string, error: string}>} [settingsErrors] - Provider settings that failed to load/parse (so a DB error is distinguishable from "provider disabled")
 * @property {Array<{provider: string, error: string}>} [claimErrors] - Due providers whose report slot couldn't be claimed because of a DB error
 * @property {{checked: number, deferred: number, available: number, expiring: number, expired: number, failed: number}} [domains] - Domain counts (if executed); failed = checks that failed in this run or within the last 12 hours (the report's failures section)
 * @property {NotificationSendResult} [notifications] - Notification sending results (if executed)
 */

/** @type {Record<string, ProviderConfig>} */
const PROVIDERS = {
    slack: {
        name: "Slack",
        query: "SELECT_SLACK_SETTINGS",
        service: slackNotifier,
        validate: (s) => isSlackWebhookUrl(s.webhook_url ?? ""),
        missing: "missing or invalid webhook URL",
    },
    discord: {
        name: "Discord",
        query: "SELECT_DISCORD_SETTINGS",
        service: discordNotifier,
        validate: (s) => isDiscordWebhookUrl(s.webhook_url ?? ""),
        missing: "missing or invalid webhook URL",
    },
    resend: {
        name: "Resend Email",
        query: "SELECT_RESEND_SETTINGS",
        service: resendNotifier,
        validate: (s) => !!(s.api_key && s.to_email && s.from_email),
        missing: "missing API key or email address",
    },
};

/**
 * Report failures: this run's batch failures plus the domains whose latest
 * check failed within the last 12 hours (stored in the DB), one entry per
 * domain. Batch entries win - recordCheckFailure is best-effort, so the DB
 * can miss (or hold an older message for) a failure of this run.
 * @param {CheckFailure[]} batchFailures - Failures from this run's verification batch
 * @param {CheckFailure[]} recentFailures - Failures read from the DB (SELECT_RECENT_CHECK_FAILURES)
 * @returns {CheckFailure[]} Batch failures first, then the remaining stored ones
 */
const mergeFailures = (batchFailures, recentFailures) => {
    const seen = new Set(batchFailures.map((failure) => failure.domain_name));
    // Sorted by name so a retried report renders the same content (Resend
    // then replays the first attempt's response for its idempotency key)
    return [
        ...batchFailures,
        ...recentFailures.filter((failure) => !seen.has(failure.domain_name)),
    ].sort((a, b) => a.domain_name.localeCompare(b.domain_name));
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
     * Scheduled runs claim each due provider's daily report slot before any
     * work (so overlapping cron runs can't send the same report twice) and
     * give the slot back when the send fails, so the next tick retries
     * within the catch-up window. Only a release after domain verification
     * completed marks the slot as attempted, so a run that failed earlier
     * (e.g. a D1 read timeout) is retried with verification.
     *
     * @param {boolean} [force=false] - Manual run: bypass the schedule (and
     *   its state), force execution and also re-verify domains checked within
     *   the last 12 hours
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
        const now = new Date();
        const local = getLocalDateTime(now);
        console.log(
            `🕐 Check at: ${local.date} ${local.time} (${getTimezone()}) ${
                force ? "(FORCED)" : ""
            }`
        );

        try {
            // Get providers to send to
            const { providers: selectedProviders, settingsErrors } =
                await this.getProviders(now, force);

            // Scheduled runs own a provider only after claiming its slot;
            // manual runs neither need nor touch the schedule state
            /** @type {ActiveProvider[]} */
            const providersToSend = [];
            /** @type {Array<{provider: string, error: string}>} */
            const claimErrors = [];
            for (const provider of selectedProviders) {
                const claim = force
                    ? "claimed"
                    : await this.claimSlot(provider);
                if (claim === "claimed") {
                    providersToSend.push(provider);
                } else if (claim === "error") {
                    claimErrors.push({
                        provider: provider.key,
                        error: "Could not claim the scheduled report slot",
                    });
                }
            }

            const baseResponse = {
                timestamp: new Date().toISOString(),
                timestampLocal: formatHumanDate(new Date().toISOString()),
                ...(settingsErrors.length > 0 && { settingsErrors }),
                ...(claimErrors.length > 0 && { claimErrors }),
            };

            if (providersToSend.length === 0) {
                return {
                    ...baseResponse,
                    action: "skipped",
                    reason:
                        claimErrors.length > 0
                            ? "Due report could not be claimed (database error)"
                            : selectedProviders.length > 0
                              ? "Due report already claimed by another run"
                              : settingsErrors.length > 0
                              ? "No providers scheduled (some provider settings failed to load)"
                              : "No providers scheduled",
                };
            }

            /** @type {NotificationSendResult|undefined} */
            let notifications;
            // Set once checkDomains resolved: only then does a release mark
            // the slot as attempted (see releaseSlot)
            let verified = false;
            try {
                // A retry tick (every provider's earlier attempt today
                // failed after verification) reuses the stored domain state:
                // a broken webhook must not spend another batch of lookups
                // every minute
                const isRetry =
                    !force &&
                    providersToSend.every(
                        (provider) =>
                            provider.settings.last_attempt_on ===
                            provider.slotDate
                    );

                // First get domain data, then send notifications
                console.log(
                    isRetry
                        ? "🔁 Retrying today's report - reusing stored domain state"
                        : "🔍 Checking domains..."
                );
                const domains = await this.checkDomains(force, {
                    verify: !isRetry,
                });
                verified = true;

                console.log("📨 Sending notifications...");
                notifications = await this.sendNotifications(
                    providersToSend,
                    domains
                );

                return {
                    ...baseResponse,
                    action: "executed",
                    domains: {
                        checked: domains.checked,
                        deferred: domains.deferred,
                        available: domains.available.length,
                        expiring: domains.expiring.length,
                        expired: domains.expired.length,
                        failed: domains.failures.length,
                    },
                    notifications,
                };
            } finally {
                // Unsent providers (failed send, or the run threw) give their
                // slot back so the next tick retries
                if (!force) {
                    const sent = new Set(notifications?.providers ?? []);
                    await Promise.all(
                        providersToSend
                            .filter((provider) => !sent.has(provider.key))
                            .map((provider) =>
                                this.releaseSlot(provider, verified)
                            )
                    );
                }
            }
        } catch (error) {
            console.error("❌ Notification failed:", error);
            throw error;
        }
    },

    /**
     * Determines which notification providers should send notifications
     *
     * Skips (with a log line saying why) providers whose settings failed to
     * load, that are disabled or not fully configured. Forced mode selects
     * every remaining provider; scheduled mode only those whose daily report
     * is due per getScheduleDecision (not sent for that day yet, and now is
     * within NOTIFICATION_CATCH_UP_MINUTES after the notification time in
     * PUBLIC_TIMEZONE).
     *
     * @param {Date} [now=new Date()] - Current instant
     * @param {boolean} [force=false] - Bypass the schedule for all enabled providers
     * @returns {Promise<{providers: ActiveProvider[], settingsErrors: Array<{provider: string, error: string}>}>} Providers to use plus any settings load failures
     *
     * @example
     * // Get providers whose report is due now
     * const { providers } = await cronNotifications.getProviders(new Date());
     *
     * @example
     * // Get all enabled providers
     * const { providers } = await cronNotifications.getProviders(new Date(), true);
     */
    async getProviders(now = new Date(), force = false) {
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
                console.log(`⏭️ ${config.name} skipped: disabled`);
                continue;
            }

            if (!config.validate(settings)) {
                console.log(
                    `⚠️ ${config.name} skipped: enabled but not configured (${config.missing})`
                );
                continue;
            }

            if (force) {
                console.log(`✅ ${config.name} selected (forced)`);
                providers.push({ key, ...config, settings });
                continue;
            }

            const decision = getScheduleDecision({
                notificationTime: settings.notification_time,
                lastSentOn: settings.last_sent_on,
                now,
            });

            if (decision.due && decision.slotDate) {
                console.log(
                    `✅ ${config.name} selected (scheduled ${settings.notification_time}, now ${decision.localTime} ${getTimezone()}, ${decision.minutesLate} min late, report for ${decision.slotDate})`
                );
                providers.push({
                    key,
                    ...config,
                    settings,
                    slotDate: decision.slotDate,
                });
            } else {
                console.log(
                    `⏭️ ${config.name} skipped: ${this.describeSkip(
                        decision,
                        settings
                    )}`
                );
            }
        }

        return { providers, settingsErrors };
    },

    /**
     * Human-readable reason a scheduled provider was not selected
     * @param {ScheduleDecision} decision - Schedule decision for the provider
     * @param {ProviderSettings} settings - Provider settings
     * @returns {string} Reason for the skip log line
     */
    describeSkip(decision, settings) {
        const timing = `scheduled ${settings.notification_time || "-"}, now ${
            decision.localTime
        } ${getTimezone()}`;

        switch (decision.reason) {
            case "already_sent":
                return `already sent (report for ${settings.last_sent_on}; ${timing})`;
            case "before_time":
                return `not due yet (${timing})`;
            case "outside_window":
                return `outside the ${NOTIFICATION_CATCH_UP_MINUTES}-minute catch-up window, today's report was missed (${timing})`;
            case "no_time":
                return `no valid notification time ("${
                    settings.notification_time ?? ""
                }")`;
            default:
                return timing;
        }
    },

    /**
     * Atomically claims a provider's daily report slot (scheduled runs only)
     *
     * One conditional UPDATE: of two overlapping runs only one changes the
     * row. A DB error counts as "not claimed" (the next tick tries again) but
     * is reported, so a broken settings table can't silently drop reports.
     *
     * @param {ActiveProvider} provider - Provider selected by getProviders (with slotDate)
     * @returns {Promise<"claimed"|"taken"|"error">} "claimed" when this run
     *   owns the slot, "taken" when another run (or a settings change) got
     *   there first, "error" when the claim query failed
     */
    async claimSlot(provider) {
        try {
            const result = await executeSql(
                SETTINGS_QUERIES.CLAIM_NOTIFICATION_SLOT,
                [
                    provider.key,
                    provider.slotDate,
                    provider.settings.notification_time,
                ]
            );

            if ((result?.meta?.changes ?? 0) > 0) {
                console.log(
                    `🔒 ${provider.name} claimed the report for ${provider.slotDate}`
                );
                return "claimed";
            }

            console.log(
                `⏭️ ${provider.name} skipped: report for ${provider.slotDate} already claimed by another run (or settings changed)`
            );
            return "taken";
        } catch (error) {
            console.error(`❌ ${provider.name} claim failed:`, error);
            return "error";
        }
    },

    /**
     * Gives a claimed slot back after a failed send so the next tick retries.
     * Never throws (a failed release is logged; that day's retry is lost).
     *
     * Restores the pre-claim last_sent_on. A row that had none (saved before
     * the schedule state existed, or with a time still ahead) gets the day
     * before the slot instead: still below the slot, so it stays due, but no
     * longer stateless, so a settings save can't seed today and cancel the
     * retry. Only a release after verification completed records the slot
     * as attempted (last_attempt_on), which makes the next tick a retry that
     * reuses the stored domain state.
     *
     * @param {ActiveProvider} provider - Provider whose claim should be released
     * @param {boolean} [verified=false] - Whether this run's domain check
     *   (checkDomains) completed before the send failed
     * @returns {Promise<void>}
     */
    async releaseSlot(provider, verified = false) {
        try {
            const slotDate = /** @type {string} */ (provider.slotDate);
            await executeSql(SETTINGS_QUERIES.RELEASE_NOTIFICATION_SLOT, [
                provider.key,
                slotDate,
                provider.settings.last_sent_on ?? addDaysToDate(slotDate, -1),
                verified ? 1 : 0,
            ]);
            console.log(
                `🔓 ${provider.name} report for ${provider.slotDate} not sent - released for a retry on the next tick`
            );
        } catch (error) {
            console.error(
                `❌ ${provider.name} release failed - no retry for ${provider.slotDate}:`,
                error
            );
        }
    },

    /**
     * Verifies the domains that are due, then reads the report from DB state
     *
     * The verification list comes from planVerification (shared with the
     * manual "Check Domains" button): alert-critical domains (expired
     * registered, never checked) first, then every other due domain (error,
     * available, registered without expiry data, daily/grace refresh, weekly
     * safety net) round-robin by staleness.
     *
     * Scheduled runs skip domains checked within the last 12 hours, so a
     * second provider later the same day (or a retry tick) reuses fresh DB
     * state instead of re-spending lookups (WhoisJSON quota). The list is
     * capped at CONFIG.LIMIT_DOMAIN_CHECKS so lookups + notification sends
     * stay under the Workers Free 50-subrequest budget; the remainder rolls
     * over to later runs (oldest-checked first, so rotation stays fair).
     *
     * Report sections are read back from DB state AFTER verification: failed
     * checks preserve the last known status, so a transient lookup/DB failure
     * (or a domain deferred by the cap) can't silently drop a domain from the
     * daily report. Refresh-only domains never appear in it. The failures
     * list merges this run's live batch results with the domains whose
     * latest check failed within the last 12 hours, so a retry tick or a
     * second provider later the same day (which reuse those results) still
     * reports them instead of an "all quiet" day.
     *
     * @param {boolean} [manual=false] - Manual run: also re-verify recently checked domains
     * @param {{verify?: boolean}} [options] - verify: false skips verification
     *   and only reads the report from stored DB state (retry ticks)
     * @returns {Promise<DomainCheckResult>} Comprehensive domain verification results
     *
     * @example
     * const results = await cronNotifications.checkDomains();
     * console.log(`Checked ${results.checked} domains, found ${results.available.length} available`);
     */
    async checkDomains(manual = false, { verify = true } = {}) {
        if (!verify) {
            const reportState =
                await domainVerification.getDomainReportState();
            return {
                checked: 0,
                deferred: 0,
                available: reportState.available,
                expiring: reportState.expiring,
                expired: reportState.expired,
                failures: mergeFailures([], reportState.recentFailures),
            };
        }

        // ONE unified SELECT; categories come from its SQL flags
        const categories =
            await domainVerification.getAllDomainsForVerification();
        const { domainsToVerify, critical, skippedRecent, deferred } =
            planVerification(categories, { manual });

        if (skippedRecent > 0) {
            console.log(
                `⏭️ Skipping ${skippedRecent} recently checked domains (reusing stored state)`
            );
        }
        if (deferred > 0) {
            console.log(
                `⏳ Deferring ${deferred} domains to later runs (limit ${CONFIG.LIMIT_DOMAIN_CHECKS} per run)`
            );
        }
        if (domainsToVerify.length > 0) {
            const expiredCount = domainsToVerify.filter(
                (d) => d.is_expired_registered === 1
            ).length;
            console.log(
                `🚨 Verifying ${domainsToVerify.length} domains (${critical} critical incl. ${expiredCount} expired, ${
                    domainsToVerify.length - critical
                } by staleness)...`
            );
        }

        const verificationResults =
            domainsToVerify.length > 0
                ? await domainVerification.verifyDomainsBatch(domainsToVerify)
                : null;

        // Post-check DB state drives the report sections
        const reportState = await domainVerification.getDomainReportState();

        /** @type {DomainCheckResult} */
        const results = {
            checked: verificationResults?.checked ?? 0,
            deferred,
            available: reportState.available,
            expiring: reportState.expiring,
            expired: reportState.expired,
            failures: mergeFailures(
                verificationResults?.failures ?? [],
                reportState.recentFailures
            ),
        };

        const batchFailureCount = verificationResults?.failures?.length ?? 0;
        const earlierFailureCount = results.failures.length - batchFailureCount;
        console.log(
            `✅ Domains: ${results.checked} checked, ${results.deferred} deferred, ${results.available.length} available, ${results.expired.length} expired, ${results.expiring.length} expiring, ${batchFailureCount} failed${
                earlierFailureCount > 0
                    ? ` (+${earlierFailureCount} from earlier checks)`
                    : ""
            }`
        );
        return results;
    },

    /**
     * Sends domain reports to all selected notification providers
     *
     * Providers arrive already validated (getProviders skips unconfigured
     * ones); failures are captured per provider. Sends in parallel.
     *
     * @param {ActiveProvider[]} providers - Array of provider configurations from getProviders()
     * @param {DomainCheckResult} domains - Domain verification results from checkDomains()
     * @returns {Promise<NotificationSendResult>} Notification sending results
     *
     * @example
     * const { providers } = await cronNotifications.getProviders(new Date());
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
        /** @type {Array<Promise<{key: string, success: boolean, error?: string}>>} */
        const sendPromises = providers.map(async (provider) => {
            try {
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
                    },
                    // Scheduled runs only: lets Resend dedupe a retried send
                    // (the report shows the scheduled time, so a retry renders
                    // the same content)
                    { slotDate: provider.slotDate }
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
            if (result.success) {
                results.sent++;
                results.providers.push(result.key);
            } else {
                results.errors.push({
                    provider: result.key,
                    error: result.error,
                });
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
