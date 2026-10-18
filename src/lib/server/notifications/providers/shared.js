import {
    formatHumanDate,
    getDaysUntilExpiration,
} from "#lib/utils/helpers.js";

/**
 * @fileoverview Shared helpers for notification providers.
 * Used by the Slack, Discord and Resend notifiers to render report content.
 * @module NotifierShared
 */

// Message-size helper lives in the neutral server utils module (also used by
// the provider clients); re-exported for the notifiers
export { truncateError } from "#lib/server/utils/notification-utils.js";

/**
 * Format date for display — same calendar date and format as the dashboard
 * (formatHumanDate in the configured PUBLIC_TIMEZONE, e.g. "19 October 2026")
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date (falls back to the raw string when unparseable)
 */
export const formatDate = (dateString) =>
    formatHumanDate(dateString, { showTime: false }) ?? dateString;

/**
 * Get days until domain expiry (negative if expired) — same rule as the
 * dashboard (getDaysUntilExpiration: remaining days round up, elapsed days
 * round down, so an expired domain is at least 1 day ago, never "0 days ago")
 * @param {string} expiryDate - Domain expiration date string
 * @returns {number} Days until expiry (negative if expired, 0 when unparseable)
 */
export const getDaysUntilExpiry = (expiryDate) =>
    getDaysUntilExpiration(expiryDate) ?? 0;

/**
 * Day count with the correct plural
 * @param {number} days - Whole number of days (sign is ignored)
 * @returns {string} "1 day" or "N days"
 * @example
 * pluralizeDays(1) // "1 day"
 * pluralizeDays(-3) // "3 days"
 */
export const pluralizeDays = (days) => {
    const count = Math.abs(days);
    return `${count} ${count === 1 ? "day" : "days"}`;
};

/**
 * "... and N more <noun>" overflow line with the right singular/plural
 * @param {number} count - Number of items left out
 * @param {string} singular - Noun for one item ("domain")
 * @param {string} plural - Noun for several items ("domains")
 * @returns {string} e.g. "... and 1 more domain" / "... and 3 more domains"
 */
export const formatMoreText = (count, singular, plural) =>
    `... and ${count} more ${count === 1 ? singular : plural}`;

/**
 * Expiry detail for one report line (plain text; HTML callers escape it)
 * @param {string} expires - Domain expiration date string
 * @returns {string} "expired 17 October 2026 (1 day ago)" for a past date,
 *   otherwise e.g. "expires 19 November 2026 (32 days)"
 */
export const formatExpiryDetail = (expires) => {
    const days = getDaysUntilExpiry(expires);
    return days < 0
        ? `expired ${formatDate(expires)} (${pluralizeDays(days)} ago)`
        : `expires ${formatDate(expires)} (${pluralizeDays(days)})`;
};

/**
 * Current report timestamp in the configured timezone
 * @returns {string} Human-readable timestamp (falls back to ISO string)
 */
export const getReportTimestamp = () => {
    const now = new Date().toISOString();
    return formatHumanDate(now) ?? now;
};

/**
 * Escape HTML special characters for safe interpolation into email markup
 * @param {string} value - Raw text value
 * @returns {string} HTML-escaped text
 */
export const escapeHtml = (value) =>
    String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

/**
 * Get a fun message for quiet days (no domain updates)
 *
 * Deterministic per weekday so both providers show the same message that day.
 * @returns {string} Quiet day message
 */
export const getQuietMessage = () => {
    const messages = [
        "🧘‍♂️ Zen mode activated - All domains chilling like champions!",
        "🏖️ Beach vibes only - Your domains are soaking up the sun!",
        "😴 Sleepy Sunday energy - Even your domains took a nap today!",
        "🕶️ Cool as a cucumber - Your portfolio is smooth and unbothered!",
        "🎭 Plot twist: Sometimes no news IS the best news!",
        "🏆 Achievement unlocked: Zero drama domains! Time for coffee!",
        "🦄 Unicorn status - Your domains are basically mythical today!",
        "🎪 The show must NOT go on - Because there's literally nothing dramatic happening!",
    ];

    return messages[new Date().getDay() % messages.length];
};
