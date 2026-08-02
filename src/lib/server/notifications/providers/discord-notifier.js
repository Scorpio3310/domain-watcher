import { getErrorMessage } from "$lib/utils/helpers.js";
import {
    formatDate,
    getDaysUntilExpiry,
    getQuietMessage,
    getReportTimestamp,
    truncateError,
} from "./shared.js";

/** @import { DomainUpdates, NotifierResult, DiscordEmbed } from "$lib/types" */

/**
 * Discord notification service for formatting and sending messages
 */
export const discordNotifier = {
    /**
     * Send domain monitoring report to Discord
     * @param {{webhook_url: string}} settings - Discord settings object
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
                console.log("✅ Discord domain report sent successfully");
                return {
                    success: true,
                    message: "Domain report sent to Discord successfully",
                };
            }

            const errorText = await response.text();
            console.error("❌ Discord API error:", response.status, errorText);
            return {
                success: false,
                message: `Discord API error: ${response.status} - ${errorText}`,
            };
        } catch (error) {
            console.error("❌ Failed to send Discord notification:", error);
            return {
                success: false,
                message: `Network error: ${getErrorMessage(error)}`,
            };
        }
    },

    /**
     * Format domain updates into a Discord webhook payload with embeds
     * @param {DomainUpdates} domainUpdates - Domain update data
     * @returns {{content: string, embeds: DiscordEmbed[]}} Discord message payload
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

        /** @type {DiscordEmbed[]} */
        const embeds = [
            {
                title: "Domain Detective 🕵️ - Daily Report",
                description: `Date: ${timestamp} • ${totalCount} domain update${
                    totalCount !== 1 ? "s" : ""
                }${
                    failures.length > 0
                        ? ` • ${failures.length} check failure${
                              failures.length !== 1 ? "s" : ""
                          }`
                        : ""
                }`,
                color: 0x1a1a1a,
            },
        ];

        // Add each section as its own colored embed if it has domains
        const sections = [
            {
                domains: expired,
                title: "🚨 Expired but Still Registered",
                color: 0xed0000,
                urgent: true,
            },
            {
                domains: available,
                title: "🟢 Available Domains",
                color: 0x2ba805,
                urgent: false,
            },
            {
                domains: expiring,
                title: "⚠️ Expiring Soon",
                color: 0xeb700a,
                urgent: false,
            },
        ];

        sections.forEach(({ domains, title, color, urgent }) => {
            if (domains.length === 0) return;

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

            const moreText =
                domains.length > 20
                    ? `\n_... and ${domains.length - 20} more domains_`
                    : "";

            embeds.push({
                title: `${title} (${domains.length})`,
                description: `${domainList}${moreText}`,
                color,
            });
        });

        // Failed checks are shown explicitly — a lookup/DB hiccup must never
        // masquerade as a quiet day
        if (failures.length > 0) {
            const failureList = failures
                .slice(0, 20)
                .map(
                    (failure) =>
                        `• \`${failure.domain_name}\` - ${truncateError(
                            failure.error
                        )}`
                )
                .join("\n");

            const moreText =
                failures.length > 20
                    ? `\n_... and ${failures.length - 20} more check failures_`
                    : "";

            embeds.push({
                title: `⛔ Check Failures (${failures.length})`,
                description: `${failureList}${moreText}`,
                color: 0x999999,
            });
        }

        // If no domains to report, add a fun "all quiet" message
        if (totalCount === 0 && failures.length === 0) {
            embeds.push({
                description: `**${getQuietMessage()}**\n\n💡 _Pro tip: This is exactly what you want to see! No expired domains, no urgent renewals, just peaceful domain harmony._`,
                color: 0x2ba805,
            });
        }

        return {
            content:
                totalCount === 0 && failures.length === 0
                    ? "🌐 Domain Watcher: All quiet on the western front! 🤠"
                    : `🌐 Domain Watcher: ${totalCount} updates${
                          failures.length > 0
                              ? `, ${failures.length} check failures`
                              : ""
                      }`,
            embeds,
        };
    },
};
