import { getErrorMessage } from "#lib/utils/helpers.js";
import {
    formatApiError,
    joinLinesWithinLimit,
    NOTIFICATION_SEND_TIMEOUT_MS,
} from "#lib/server/utils/notification-utils.js";
import { isSlackWebhookUrl } from "#src/routes/settings/validation.js";
import {
    formatExpiryDetail,
    formatMoreText,
    getQuietMessage,
    getReportTimestamp,
    truncateError,
} from "./shared.js";

/** @import { DomainUpdates, NotifierResult, SlackBlock } from "#lib/types.js" */

// Slack rejects the whole message (400 invalid_blocks) when a single section
// text exceeds 3000 characters or the message has more than 50 blocks, so
// lists are cut to a character budget (with headroom) instead of a line count
const SLACK_TEXT_BUDGET = 2800;
const SLACK_MAX_BLOCKS = 50;
const MAX_LIST_LINES = 20;

/**
 * Slack notification service for formatting and sending messages
 */
export const slackNotifier = {
    /**
     * Send domain monitoring report to Slack
     * @param {{webhook_url: string}} settings - Slack settings object
     * @param {DomainUpdates} domainUpdates - Domain update data
     * @returns {Promise<NotifierResult>} Send result
     */
    async sendDomainReport(settings, domainUpdates) {
        try {
            if (!settings?.webhook_url) {
                return {
                    success: false,
                    message: "Webhook URL not configured",
                };
            }

            // Re-validate the stored URL: never POST the report anywhere but
            // a Slack webhook (e.g. a row edited outside the settings form)
            if (!isSlackWebhookUrl(settings.webhook_url)) {
                console.error("❌ Stored Slack webhook URL is invalid");
                return {
                    success: false,
                    message:
                        "Stored webhook URL is not a valid Slack webhook URL - save it again in Settings",
                };
            }

            const message = this.formatDomainMessage(domainUpdates);
            const response = await fetch(settings.webhook_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(message),
                signal: AbortSignal.timeout(NOTIFICATION_SEND_TIMEOUT_MS),
            });

            if (response.ok) {
                console.log("✅ Slack domain report sent successfully");
                return {
                    success: true,
                    message: "Domain report sent to Slack successfully",
                };
            }

            const errorText = await response.text();
            console.error("❌ Slack API error:", response.status, errorText);
            return {
                success: false,
                message: formatApiError("Slack", response.status, errorText),
            };
        } catch (error) {
            console.error("❌ Failed to send Slack notification:", error);
            return {
                success: false,
                message: `Network error: ${getErrorMessage(error)}`,
            };
        }
    },

    /**
     * Format domain updates into Slack message blocks
     * @param {DomainUpdates} domainUpdates - Domain update data
     * @returns {{text: string, blocks: SlackBlock[]}} Slack message payload
     */
    formatDomainMessage(domainUpdates) {
        const {
            available = [],
            expiring = [],
            expired = [],
            failures = [],
            totalCount,
        } = domainUpdates;
        const timestamp = getReportTimestamp();

        /** @type {SlackBlock[]} */
        const blocks = [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "Domain Detective 🕵️ - Daily Report",
                },
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `Date: ${timestamp} • ${totalCount} domain update${
                            totalCount !== 1 ? "s" : ""
                        }${
                            failures.length > 0
                                ? ` • ${failures.length} check failure${
                                      failures.length !== 1 ? "s" : ""
                                  }`
                                : ""
                        }`,
                    },
                ],
            },
        ];

        if (totalCount > 0 || failures.length > 0)
            blocks.push({ type: "divider" });

        // Add each section if it has domains
        const sections = [
            { domains: expired, title: "🚨 Expired but Still Registered" },
            { domains: available, title: "🟢 Available Domains" },
            { domains: expiring, title: "⚠️ Expiring Soon" },
        ];

        let addedSection = false;
        sections.forEach(({ domains, title }) => {
            if (domains.length === 0) return;

            // Add divider between sections
            if (addedSection) blocks.push({ type: "divider" });

            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${title} (${domains.length})*`,
                },
            });

            const { text: domainList, shown } = joinLinesWithinLimit(
                domains
                    .slice(0, MAX_LIST_LINES)
                    .map((domain) =>
                        domain.expires
                            ? `• \`${domain.domain_name}\` - ${formatExpiryDetail(
                                  domain.expires
                              )}`
                            : `• \`${domain.domain_name}\``
                    ),
                SLACK_TEXT_BUDGET,
                // A section needs non-empty text: cut an oversized first line
                { truncateOversizedFirstLine: true }
            );

            blocks.push({
                type: "section",
                text: { type: "mrkdwn", text: domainList },
            });

            if (domains.length > shown) {
                blocks.push({
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: formatMoreText(
                                domains.length - shown,
                                "domain",
                                "domains"
                            ),
                        },
                    ],
                });
            }

            addedSection = true;
        });

        // Failed checks are shown explicitly — a lookup/DB hiccup must never
        // masquerade as a quiet day
        if (failures.length > 0) {
            if (addedSection) blocks.push({ type: "divider" });

            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*⛔ Check Failures (${failures.length})*`,
                },
            });

            const { text: failureList, shown } = joinLinesWithinLimit(
                failures
                    .slice(0, MAX_LIST_LINES)
                    .map(
                        (failure) =>
                            `• \`${failure.domain_name}\` - ${truncateError(
                                failure.error
                            )}`
                    ),
                SLACK_TEXT_BUDGET,
                { truncateOversizedFirstLine: true }
            );

            blocks.push({
                type: "section",
                text: { type: "mrkdwn", text: failureList },
            });

            if (failures.length > shown) {
                blocks.push({
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: formatMoreText(
                                failures.length - shown,
                                "check failure",
                                "check failures"
                            ),
                        },
                    ],
                });
            }
        }

        // If no domains to report, add a fun "all quiet" message
        if (totalCount === 0 && failures.length === 0) {
            blocks.push({ type: "divider" });
            blocks.push({
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*${getQuietMessage()}*`,
                },
            });

            blocks.push({
                type: "context",
                elements: [
                    {
                        type: "mrkdwn", 
                        text: "💡 _Pro tip: This is exactly what you want to see! No expired domains, no urgent renewals, just peaceful domain harmony._"
                    }
                ]
            });
        }

        // The layout above stays far below the cap (about 20 blocks); this only
        // guards against a future section getting the whole report rejected
        if (blocks.length > SLACK_MAX_BLOCKS) blocks.length = SLACK_MAX_BLOCKS;

        return {
            text:
                totalCount === 0 && failures.length === 0
                    ? `🌐 Domain Watcher: All quiet on the western front! 🤠`
                    : `🌐 Domain Watcher: ${totalCount} update${
                          totalCount !== 1 ? "s" : ""
                      }${
                          failures.length > 0
                              ? `, ${failures.length} check failure${
                                    failures.length !== 1 ? "s" : ""
                                }`
                              : ""
                      }`,
            blocks,
        };
    },
};
