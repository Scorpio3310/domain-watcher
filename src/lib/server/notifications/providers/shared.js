import {
    formatHumanDate,
    getDaysUntilExpiration,
} from "#lib/utils/helpers.js";

/**
 * @fileoverview Shared helpers for notification providers.
 * Used by both the Slack and Resend notifiers to render report content.
 * @module NotifierShared
 */

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
 * dashboard (getDaysUntilExpiration: partial days round away from zero, so an
 * expired domain is at least 1 day ago, never "0 days ago")
 * @param {string} expiryDate - Domain expiration date string
 * @returns {number} Days until expiry (negative if expired, 0 when unparseable)
 */
export const getDaysUntilExpiry = (expiryDate) =>
    getDaysUntilExpiration(expiryDate) ?? 0;

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
 * Trim an error message for report rendering (protects notifier size limits,
 * e.g. Discord's 4096-character embed description)
 * @param {string} error - Raw error message
 * @param {number} [maxLength=200] - Maximum length before truncation
 * @returns {string} Error message capped at maxLength characters
 */
export const truncateError = (error, maxLength = 200) =>
    error.length > maxLength ? `${error.slice(0, maxLength - 1)}…` : error;

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
