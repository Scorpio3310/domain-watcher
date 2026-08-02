import { getErrorMessage } from "$lib/utils/helpers.js";
import {
    formatDate,
    getDaysUntilExpiry,
    getQuietMessage,
    getReportTimestamp,
    truncateError,
} from "./shared.js";

/** @import { DomainUpdates, NotifierResult, SlackBlock } from "$lib/types" */

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

            const message = this.formatDomainMessage(domainUpdates);
            const response = await fetch(settings.webhook_url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(message),
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
                message: `Slack API error: ${response.status} - ${errorText}`,
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
            {
                domains: expired,
                title: "🚨 Expired but Still Registered",
                urgent: true,
            },
            {
                domains: available,
                title: "🟢 Available Domains",
                urgent: false,
            },
            { domains: expiring, title: "⚠️ Expiring Soon", urgent: false },
        ];

        let addedSection = false;
        sections.forEach(({ domains, title, urgent }) => {
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

            const domainList = domains
                .slice(0, 20)
                .map((domain) => {
                    if (urgent && domain.expires) {
                        const daysExpired = Math.abs(
                            getDaysUntilExpiry(domain.expires)
                        );
                        return `• \`${
                            domain.domain_name
                        }\` - expired ${formatDate(
                            domain.expires
                        )} (${daysExpired} days ago)`;
                    }

                    if (domain.expires) {
                        const daysUntilExpiry = getDaysUntilExpiry(
                            domain.expires
                        );
                        return `• \`${
                            domain.domain_name
                        }\` - expires ${formatDate(
                            domain.expires
                        )} (${daysUntilExpiry} days)`;
                    }

                    return `• \`${domain.domain_name}\``;
                })
                .join("\n");

            blocks.push({
                type: "section",
                text: { type: "mrkdwn", text: domainList },
            });

            if (domains.length > 20) {
                blocks.push({
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: `... and ${
                                domains.length - 20
                            } more ${title.toLowerCase()} domains`,
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

            const failureList = failures
                .slice(0, 20)
                .map(
                    (failure) =>
                        `• \`${failure.domain_name}\` - ${truncateError(
                            failure.error
                        )}`
                )
                .join("\n");

            blocks.push({
                type: "section",
                text: { type: "mrkdwn", text: failureList },
            });

            if (failures.length > 20) {
                blocks.push({
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: `... and ${
                                failures.length - 20
                            } more check failures`,
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

        return {
            text:
                totalCount === 0 && failures.length === 0
                    ? `🌐 Domain Watcher: All quiet on the western front! 🤠`
                    : `🌐 Domain Watcher: ${totalCount} updates${
                          failures.length > 0
                              ? `, ${failures.length} check failures`
                              : ""
                      }`,
            blocks,
        };
    },
};
