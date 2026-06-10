import { getErrorMessage } from "$lib/utils/helpers.js";
import { formatDate, getDaysUntilExpiry } from "./date-format.js";

/** @import { DomainUpdates, NotifierResult, SlackBlock } from "$lib/types" */

/**
 * Slack notification service for formatting and sending messages
 */
export const slackNotifier = {
    /**
     * Send domain monitoring report to Slack
     * @param {{webhook_url: string}} settings - Slack settings object
     * @param {DomainUpdates} domainUpdates - Domain update data
     * @param {string} [origin=""] - Optional origin URL for links
     * @returns {Promise<NotifierResult>} Send result
     */
    async sendDomainReport(settings, domainUpdates, origin = "") {
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
            totalCount,
        } = domainUpdates;
        const timestamp = new Date().toLocaleString();

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
                        }`,
                    },
                ],
            },
        ];

        if (totalCount > 0) blocks.push({ type: "divider" });

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

        // If no domains to report, add a fun "all quiet" message
        if (totalCount === 0) {
            const quietMessages = [
                "🧘‍♂️ *Zen mode activated* - All your domains are chilling like champions today!",
                "🏖️ *Beach vibes only* - Your domains are soaking up the sun, nothing to worry about!",  
                "😴 *Sleepy Sunday energy* - Even your domains decided to take a nap today!",
                "🕶️ *Cool as a cucumber* - Your domain portfolio is looking smooth and unbothered!",
                "🎭 *Plot twist:* Sometimes no news IS the best news! Your domains are behaving perfectly.",
                "🏆 *Achievement unlocked:* Zero drama domains! Time to celebrate with a coffee ☕",
                "🦄 *Unicorn status* - Your domains are so well-behaved, they're basically mythical today!",
                "🎪 *The show must NOT go on* - Because there's literally nothing dramatic happening! 🎉"
            ];

            // Pick a random message based on the day to keep it fresh
            const messageIndex = new Date().getDay() % quietMessages.length;
            const selectedMessage = quietMessages[messageIndex];

            blocks.push({ type: "divider" });
            blocks.push({
                type: "section", 
                text: {
                    type: "mrkdwn",
                    text: selectedMessage
                }
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
            text: totalCount === 0 
                ? `🌐 Domain Watcher: All quiet on the western front! 🤠`
                : `🌐 Domain Watcher: ${totalCount} updates`,
            blocks,
        };
    },
};
