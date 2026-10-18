import { getErrorMessage } from "#lib/utils/helpers.js";
import {
    formatDate,
    getDaysUntilExpiry,
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
 * Join list lines, stopping before the text would exceed the character budget
 * @param {string[]} lines - Rendered list lines, in display order
 * @param {number} maxChars - Character budget for the joined text
 * @returns {{text: string, shown: number}} Joined text and how many lines fit
 */
const joinLinesWithinLimit = (lines, maxChars) => {
    let text = "";
    let shown = 0;
    for (const line of lines) {
        const next = shown === 0 ? line : `${text}\n${line}`;
        if (next.length > maxChars) break;
        text = next;
        shown++;
    }

    // A section needs non-empty text: cut an oversized first line instead
    if (shown === 0 && lines.length > 0)
        return { text: truncateError(lines[0], maxChars), shown: 1 };

    return { text, shown };
};

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

            const { text: domainList, shown } = joinLinesWithinLimit(
                domains.slice(0, MAX_LIST_LINES).map((domain) => {
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
                }),
                SLACK_TEXT_BUDGET
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
                            text: `... and ${
                                domains.length - shown
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

            const { text: failureList, shown } = joinLinesWithinLimit(
                failures
                    .slice(0, MAX_LIST_LINES)
                    .map(
                        (failure) =>
                            `• \`${failure.domain_name}\` - ${truncateError(
                                failure.error
                            )}`
                    ),
                SLACK_TEXT_BUDGET
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
                            text: `... and ${
                                failures.length - shown
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

        // The layout above stays far below the cap (about 20 blocks); this only
        // guards against a future section getting the whole report rejected
        if (blocks.length > SLACK_MAX_BLOCKS) blocks.length = SLACK_MAX_BLOCKS;

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
