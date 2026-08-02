import { formatHumanDate } from "$lib/utils/helpers.js";

/**
 * @fileoverview Shared helpers for notification providers.
 * Used by both the Slack and Resend notifiers to render report content.
 * @module NotifierShared
 */

/**
 * Format date for display
 * @param {string} dateString - Date string to format
 * @returns {string} Formatted date
 */
export const formatDate = (dateString) =>
    new Date(dateString).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

/**
 * Get days until domain expiry (negative if expired)
 * @param {string} expiryDate - Domain expiration date string
 * @returns {number} Days until expiry (negative if expired)
 */
export const getDaysUntilExpiry = (expiryDate) => {
    const diffTime = new Date(expiryDate).getTime() - Date.now();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
