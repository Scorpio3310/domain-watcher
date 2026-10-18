import { getErrorMessage } from "#lib/utils/helpers.js";
import {
    formatDate,
    getDaysUntilExpiry,
    getQuietMessage,
    getReportTimestamp,
    truncateError,
} from "./shared.js";

/** @import { DomainUpdates, NotifierResult, DiscordEmbed } from "#lib/types.js" */

// Discord rejects the whole message (400) when an embed description exceeds
// 4096 characters or all embeds together exceed 6000 characters (titles +
// descriptions). Titles here are short fixed strings, the report uses at most
// 5 embeds (cap 10) and no fields (1024 / 25 caps), so only the list
// descriptions need trimming: they share one running budget (with headroom).
const DISCORD_DESCRIPTION_LIMIT = 4096;
const DISCORD_TOTAL_BUDGET = 5900;
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
    return { text, shown };
};

/**
 * Render a list embed description within a character budget, ending with
 * "... and N more" when items had to be left out
 * @param {{lines: string[], total: number, label: string}} list - Rendered lines (first MAX_LIST_LINES), total item count and item label
 * @param {number} maxChars - Character budget for the description
 * @returns {string} Embed description
 */
const formatListDescription = ({ lines, total, label }, maxChars) => {
    /** @param {number} hidden */
    const formatMore = (hidden) => `_... and ${hidden} more ${label}_`;

    const fullList = lines.join("\n");
    const full =
        total > lines.length
            ? `${fullList}\n${formatMore(total - lines.length)}`
            : fullList;
    if (full.length <= maxChars) return full;

    // Reserve room for the suffix, sized for the largest possible count
    const { text, shown } = joinLinesWithinLimit(
        lines,
        maxChars - formatMore(total).length - 1
    );
    const moreText = formatMore(total - shown);
    return text ? `${text}\n${moreText}` : moreText;
};

/**
 * Split a character budget across sections, max-min fair: sections that fit
 * keep everything they need, the rest share what is left evenly
 * @param {number[]} needs - Characters each section needs to be shown in full
 * @param {number} budget - Total characters available
 * @returns {number[]} Characters allocated to each section (same order)
 */
const allocateBudget = (needs, budget) => {
    const allocations = needs.map(() => 0);
    let remaining = budget;
    needs
        .map((need, index) => ({ need, index }))
        .sort((a, b) => a.need - b.need)
        .forEach(({ need, index }, position, sorted) => {
            const share = Math.floor(remaining / (sorted.length - position));
            allocations[index] = Math.min(need, share);
            remaining -= allocations[index];
        });
    return allocations;
};

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

        const headerTitle = "Domain Detective 🕵️ - Daily Report";
        const headerDescription = `Date: ${timestamp} • ${totalCount} domain update${
            totalCount !== 1 ? "s" : ""
        }${
            failures.length > 0
                ? ` • ${failures.length} check failure${
                      failures.length !== 1 ? "s" : ""
                  }`
                : ""
        }`;

        /** @type {DiscordEmbed[]} */
        const embeds = [
            {
                title: headerTitle,
                description: headerDescription,
                color: 0x1a1a1a,
            },
        ];

        /** @type {{title: string, lines: string[], total: number, label: string, color: number}[]} */
        const lists = [];

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

            lists.push({
                title: `${title} (${domains.length})`,
                lines: domains.slice(0, MAX_LIST_LINES).map((domain) => {
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
                total: domains.length,
                label: "domains",
                color,
            });
        });

        // Failed checks are shown explicitly — a lookup/DB hiccup must never
        // masquerade as a quiet day
        if (failures.length > 0) {
            lists.push({
                title: `⛔ Check Failures (${failures.length})`,
                lines: failures
                    .slice(0, MAX_LIST_LINES)
                    .map(
                        (failure) =>
                            `• \`${failure.domain_name}\` - ${truncateError(
                                failure.error
                            )}`
                    ),
                total: failures.length,
                label: "check failures",
                color: 0x999999,
            });
        }

        // Header and list titles are fixed costs; the list descriptions share
        // whatever is left of the total budget
        const fixedChars =
            headerTitle.length +
            headerDescription.length +
            lists.reduce((sum, list) => sum + list.title.length, 0);
        const allocations = allocateBudget(
            lists.map((list) =>
                Math.min(
                    formatListDescription(list, Infinity).length,
                    DISCORD_DESCRIPTION_LIMIT
                )
            ),
            DISCORD_TOTAL_BUDGET - fixedChars
        );

        lists.forEach((list, index) => {
            embeds.push({
                title: list.title,
                description: formatListDescription(list, allocations[index]),
                color: list.color,
            });
        });

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
