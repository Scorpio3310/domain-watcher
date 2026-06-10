/**
 * @fileoverview Shared date formatting helpers for notification providers.
 * Used by both the Slack and Resend notifiers to render expiry information.
 * @module NotifierDateFormat
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
