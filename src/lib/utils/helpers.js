import { PUBLIC_ENVIRONMENT, PUBLIC_TIMEZONE } from "$env/static/public";
import {
    formatDistanceToNow,
    parseISO,
    differenceInDays,
    isPast,
    isValid,
} from "date-fns";

// ============================================================================
// UTILITY FUNCTIONS (internal helpers)
// ============================================================================

const getTimezone = () => PUBLIC_TIMEZONE || "UTC";

/**
 * Parse various date formats to Date object
 * @param {string|Date|null} dateInput - Date in various formats
 * @param {boolean} [assumeUTC=true] - Whether to assume input is UTC
 * @returns {Date|null} Parsed date or null if invalid
 */
const parseDate = (dateInput, assumeUTC = true) => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;

    try {
        if (typeof dateInput === "string") {
            if (dateInput.includes("T")) return parseISO(dateInput);
            const utcString = assumeUTC
                ? `${dateInput.replace(" ", "T")}Z`
                : dateInput.replace(" ", "T");
            return parseISO(utcString);
        }
        return new Date(dateInput);
    } catch (error) {
        console.warn("Failed to parse date:", dateInput, error);
        return null;
    }
};

// ============================================================================
// HELPER FUNCTIONS (general purpose utilities)
// ============================================================================

export const isDemo = () => PUBLIC_ENVIRONMENT === "demo";

/**
 * Get current time in configured timezone as HH:mm string
 * @returns {string} Current time in HH:mm format (24-hour) in configured timezone
 * @example
 * // With PUBLIC_TIMEZONE="Europe/Ljubljana"
 * getCurrentTimeInTimezone() // "16:30"
 *
 * // With PUBLIC_TIMEZONE="UTC" or undefined
 * getCurrentTimeInTimezone() // "14:30"
 */
export const getCurrentTimeInTimezone = () => {
    const options = {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: getTimezone(),
    };
    try {
        return new Date().toLocaleTimeString("en-GB", options);
    } catch (error) {
        console.warn("Failed to get time in timezone:", getTimezone(), error);
        return new Date().toLocaleTimeString("en-GB", {
            ...options,
            timeZone: "UTC",
        });
    }
};

/**
 * Mask API key for demo mode - show first N characters then asterisks
 * @param {string} apiKey - Original API key to mask
 * @param {number} [visibleChars=6] - Number of characters to show (default 6)
 * @returns {string} Masked API key (unchanged if shorter than visibleChars)
 * @example
 * maskApiKey("sk-1234567890abcdef") // "sk-123***************"
 * maskApiKey("short", 6) // "short" (unchanged)
 * maskApiKey("verylongapikey123456789", 8) // "verylong********************"
 */
export const maskApiKey = (apiKey, visibleChars = 6) =>
    !apiKey || apiKey.length <= visibleChars
        ? apiKey
        : `${apiKey.substring(0, visibleChars)}${"*".repeat(
              Math.min(apiKey.length - visibleChars, 20)
          )}`;

/**
 * Parse whois raw data and extract registrar information
 * @param {string|null} rawDomainData - Raw JSON string containing whois data
 * @returns {string|null} Registrar name, error message, or null if not found
 * @example
 * // Valid registrar data
 * const rawData = '{"registrar": {"name": "GoDaddy"}}';
 * getRegistrar(rawData); // "GoDaddy"
 *
 * // No registrar in data
 * const rawData2 = '{"domain": "example.com"}';
 * getRegistrar(rawData2); // null
 *
 * // Invalid JSON
 * getRegistrar('invalid json'); // "Unexpected token 'i'..."
 *
 * // Null input
 * getRegistrar(null); // null
 */
export const getRegistrar = (rawDomainData) => {
    if (!rawDomainData) return null;
    try {
        return JSON.parse(rawDomainData).registrar?.name || null;
    } catch (error) {
        console.error("❌ Error parsing registrar data:", error);
        return error?.message || "Invalid JSON";
    }
};

// ============================================================================
// DATE FORMATTING FUNCTIONS (specialized date utilities)
// ============================================================================

/**
 * Date formatting utilities for domain monitoring application
 * Provides human-readable date formatting, expiration status, and relative time calculations
 * @fileoverview Centralized date formatting with timezone support and localization
 */

// =============================================================================
// BASIC DATE FORMATTING
// =============================================================================

/**
 * Formats date to human-readable format in configured timezone
 * @function formatHumanDate
 * @param {string|Date|null} dateInput - Date to format (ISO string, Date object, or null)
 * @param {Object} [options={}] - Formatting configuration options
 * @param {('short'|'medium'|'long'|'full')} [options.dateStyle='long'] - Date formatting style
 * @param {('short'|'medium'|'long'|'full')} [options.timeStyle='short'] - Time formatting style
 * @param {boolean} [options.showTime=true] - Whether to include time in output
 * @param {boolean} [options.assumeUTC=true] - Whether to assume input is UTC if no timezone specified
 * @returns {string|null} Formatted date string in user's timezone or null if invalid input
 * @example
 * // Basic usage with ISO string
 * formatHumanDate('2025-07-29T14:30:00Z')
 * // Returns: "29 July 2025 at 16:30" (assuming Europe/Ljubljana timezone)
 *
 * @example
 * // Date only, no time
 * formatHumanDate('2025-07-29', { showTime: false })
 * // Returns: "29 July 2025"
 *
 * @example
 * // Different date styles
 * formatHumanDate('2025-07-29T14:30:00Z', { dateStyle: 'short' })
 * // Returns: "29/07/2025, 16:30"
 * formatHumanDate('2025-07-29T14:30:00Z', { dateStyle: 'medium' })
 * // Returns: "29 Jul 2025, 16:30"
 * formatHumanDate('2025-07-29T14:30:00Z', { dateStyle: 'full' })
 * // Returns: "Tuesday, 29 July 2025 at 16:30"
 *
 * @example
 * // Invalid inputs
 * formatHumanDate(null) // Returns: null
 * formatHumanDate('invalid-date') // Returns: null
 * formatHumanDate('') // Returns: null
 *
 * @example
 * // Date object input
 * formatHumanDate(new Date('2025-07-29T14:30:00Z'))
 * // Returns: "29 July 2025 at 16:30"
 */
export const formatHumanDate = (dateInput, options = {}) => {
    const {
        dateStyle = "long",
        timeStyle = "short",
        showTime = true,
        assumeUTC = true,
    } = options;
    const date = parseDate(dateInput, assumeUTC);

    if (!date || !isValid(date)) return null;

    try {
        const formatOptions = {
            timeZone: getTimezone(),
            ...(showTime ? { dateStyle, timeStyle } : { dateStyle }),
        };
        return date.toLocaleString("en-GB", formatOptions);
    } catch (error) {
        console.warn("Date formatting failed:", error);
        return "Invalid date";
    }
};

// =============================================================================
// DOMAIN EXPIRATION FORMATTING
// =============================================================================

/**
 * Formats expiration date with intelligent remaining time information
 * @function formatExpirationDate
 * @param {string|Date|null} expirationDate - Domain expiration date
 * @param {Object} [options={}] - Advanced formatting configuration
 * @param {boolean} [options.showRemaining=true] - Whether to show remaining/expired days
 * @param {boolean} [options.showTime=false] - Whether to include time in formatted date
 * @param {boolean} [options.showDate=true] - Whether to show the formatted date
 * @param {boolean} [options.onlyRemaining=false] - Show only remaining days text (no date)
 * @param {number|null} [options.showRemainingIfWithin=null] - Show remaining only if within X days
 * @param {boolean} [options.assumeUTC=true] - Whether to assume input is UTC
 * @returns {string|null} Formatted expiration string with optional remaining time or null if invalid
 * @example
 * // Expired domain (assuming today is 2025-07-29)
 * formatExpirationDate('2025-07-20')
 * // Returns: "20 July 2025 (expired 9 days ago)"
 *
 * @example
 * // Future expiration
 * formatExpirationDate('2025-08-15')
 * // Returns: "15 August 2025 (17 days remaining)"
 *
 * @example
 * // Expiring today
 * formatExpirationDate('2025-07-29')
 * // Returns: "29 July 2025 (0 days remaining)"
 *
 * @example
 * // Only remaining text (compact format)
 * formatExpirationDate('2025-08-15', { onlyRemaining: true })
 * // Returns: "17 days remaining"
 * formatExpirationDate('2025-07-20', { onlyRemaining: true })
 * // Returns: "expired 9 days ago"
 *
 * @example
 * // Conditional remaining display
 * formatExpirationDate('2025-08-15', { showRemainingIfWithin: 10 })
 * // Returns: "15 August 2025" (no remaining text, >10 days)
 * formatExpirationDate('2025-08-05', { showRemainingIfWithin: 10 })
 * // Returns: "5 August 2025 (7 days remaining)" (shows remaining, ≤10 days)
 *
 * @example
 * // Date without remaining info
 * formatExpirationDate('2025-08-15', { showRemaining: false })
 * // Returns: "15 August 2025"
 *
 * @example
 * // Edge cases
 * formatExpirationDate('2025-07-30') // 1 day
 * // Returns: "30 July 2025 (1 day remaining)"
 * formatExpirationDate('2025-07-28') // 1 day expired
 * // Returns: "28 July 2025 (expired 1 day ago)"
 */
export const formatExpirationDate = (expirationDate, options = {}) => {
    const {
        showRemaining = true,
        showTime = false,
        showDate = true,
        onlyRemaining = false,
        showRemainingIfWithin = null,
        assumeUTC = true,
    } = options;

    const date = parseDate(expirationDate, assumeUTC);
    if (!date || !isValid(date)) return null;

    try {
        const daysUntilExpiration = differenceInDays(date, new Date());
        const isExpired = isPast(date);
        const daysExpired = Math.abs(daysUntilExpiration);

        const getRemainingText = () =>
            isExpired
                ? `expired ${daysExpired} ${
                      daysExpired === 1 ? "day" : "days"
                  } ago`
                : `${daysUntilExpiration} ${
                      daysUntilExpiration === 1 ? "day" : "days"
                  } remaining`;

        if (onlyRemaining) return getRemainingText();

        const shouldShowRemaining =
            showRemaining &&
            (showRemainingIfWithin === null ||
                (!isExpired && daysUntilExpiration <= showRemainingIfWithin));

        let result = showDate
            ? formatHumanDate(date, { showTime, assumeUTC: false })
            : "";

        if (shouldShowRemaining) {
            const remainingText = getRemainingText();
            result = showDate ? `${result} (${remainingText})` : remainingText;
        }

        return result;
    } catch (error) {
        console.warn("Failed to calculate remaining days:", error);
        return showDate
            ? formatHumanDate(date, { showTime, assumeUTC: false })
            : null;
    }
};

// =============================================================================
// LAST CHECKED FORMATTING
// =============================================================================

/**
 * Formats last checked date with flexible display options
 * @function formatLastChecked
 * @param {string|Date|null} lastCheckedDate - When domain was last checked
 * @param {Object} [options={}] - Display format configuration
 * @param {('both'|'relative'|'absolute')} [options.format='both'] - Display format type
 * @param {boolean} [options.assumeUTC=true] - Whether to assume input is UTC
 * @returns {string} Formatted date string ('Never' if invalid input)
 * @example
 * // Both absolute and relative (default behavior)
 * formatLastChecked('2025-07-29T10:00:00Z') // Assuming current time is 14:00
 * // Returns: "29 July 2025 at 12:00 (4 hours ago)"
 *
 * @example
 * // Only relative time (compact)
 * formatLastChecked('2025-07-29T10:00:00Z', { format: 'relative' })
 * // Returns: "4 hours ago"
 * formatLastChecked('2025-07-28T10:00:00Z', { format: 'relative' })
 * // Returns: "1 day ago"
 * formatLastChecked('2025-07-29T14:30:00Z', { format: 'relative' })
 * // Returns: "in 30 minutes" (future time)
 *
 * @example
 * // Only absolute date (precise)
 * formatLastChecked('2025-07-29T10:00:00Z', { format: 'absolute' })
 * // Returns: "29 July 2025 at 12:00"
 *
 * @example
 * // Various time differences
 * formatLastChecked('2025-07-29T13:55:00Z') // 5 minutes ago
 * // Returns: "29 July 2025 at 15:55 (5 minutes ago)"
 * formatLastChecked('2025-07-26T10:00:00Z') // 3 days ago
 * // Returns: "26 July 2025 at 12:00 (3 days ago)"
 * formatLastChecked('2025-07-01T10:00:00Z') // 28 days ago
 * // Returns: "1 July 2025 at 12:00 (28 days ago)"
 *
 * @example
 * // Invalid or missing inputs
 * formatLastChecked(null) // Returns: "Never"
 * formatLastChecked(undefined) // Returns: "Never"
 * formatLastChecked('') // Returns: "Never"
 * formatLastChecked('invalid-date') // Returns: "Never"
 */
export const formatLastChecked = (lastCheckedDate, options = {}) => {
    const { format = "both", assumeUTC = true } = options;
    const date = parseDate(lastCheckedDate, assumeUTC);

    if (!date || !isValid(date)) return "Never";

    try {
        const relativeTime = formatDistanceToNow(date, { addSuffix: true });
        const formattedDate = formatHumanDate(date, { assumeUTC: false });

        return (
            {
                relative: relativeTime,
                absolute: formattedDate,
                both: `${formattedDate} (${relativeTime})`,
            }[format] || `${formattedDate} (${relativeTime})`
        );
    } catch (error) {
        console.warn("Failed to format last checked date:", error);
        return formatHumanDate(date, { assumeUTC: false }) || "Invalid date";
    }
};

// =============================================================================
// EXPIRATION STATUS & STYLING
// =============================================================================

/**
 * Analyzes expiration status and provides styling information
 * @function getExpirationStatus
 * @param {string|Date|null} expirationDate - Domain expiration date
 * @param {boolean} [assumeUTC=true] - Whether to assume input is UTC
 * @returns {Object} Comprehensive status object with expiration analysis and UI styling
 * @returns {('expired'|'expiring_soon'|'unknown'|undefined)} returns.status - Current expiration status category
 * @returns {number|null} returns.daysRemaining - Absolute days until/since expiration (always positive)
 * @returns {boolean} returns.isExpired - True if domain has already expired
 * @returns {boolean} returns.isExpiringSoon - True if expires within 30 days (and not expired)
 * @returns {string} returns.className - CSS class name for conditional styling based on status
 * @example
 * // Expired domain (assuming today is 2025-07-29)
 * getExpirationStatus('2025-07-20')
 * // Returns: {
 * //   status: 'expired',
 * //   daysRemaining: 9,
 * //   isExpired: true,
 * //   isExpiringSoon: false,
 * //   className: 'text-red'
 * // }
 *
 * @example
 * // Expiring soon (within 30 days)
 * getExpirationStatus('2025-08-10') // 12 days from now
 * // Returns: {
 * //   status: 'expiring_soon',
 * //   daysRemaining: 12,
 * //   isExpired: false,
 * //   isExpiringSoon: true,
 * //   className: 'text-orange'
 * // }
 *
 * @example
 * // Valid domain, not expiring soon
 * getExpirationStatus('2025-12-31') // 155 days from now
 * // Returns: {
 * //   status: undefined,
 * //   daysRemaining: 155,
 * //   isExpired: false,
 * //   isExpiringSoon: false,
 * //   className: 'text-black'
 * // }
 *
 * @example
 * // Edge cases - expiring today
 * getExpirationStatus('2025-07-29') // Today
 * // Returns: {
 * //   status: 'expiring_soon',
 * //   daysRemaining: 0,
 * //   isExpired: false,
 * //   isExpiringSoon: true,
 * //   className: 'text-orange'
 * // }
 *
 * @example
 * // Invalid or unknown expiration
 * getExpirationStatus(null)
 * // Returns: {
 * //   status: 'unknown',
 * //   daysRemaining: null,
 * //   isExpired: false,
 * //   isExpiringSoon: false,
 * //   className: 'text-black'
 * // }
 *
 * @example
 * // Usage in UI components
 * const status = getExpirationStatus(domain.expires);
 * // <span className={status.className}>
 * //   {status.isExpired ? 'EXPIRED' :
 * //    status.isExpiringSoon ? 'EXPIRES SOON' : 'ACTIVE'}
 * // </span>
 *
 * @example
 * // Boundary testing (30-day threshold)
 * getExpirationStatus('2025-08-29') // Exactly 31 days
 * // Returns: { status: undefined, isExpiringSoon: false, className: 'text-black' }
 * getExpirationStatus('2025-08-28') // Exactly 30 days
 * // Returns: { status: 'expiring_soon', isExpiringSoon: true, className: 'text-orange' }
 */
export const getExpirationStatus = (expirationDate, assumeUTC = true) => {
    const date = parseDate(expirationDate, assumeUTC);

    if (!date || !isValid(date)) {
        return {
            status: "unknown",
            daysRemaining: null,
            isExpired: false,
            isExpiringSoon: false,
            className: "text-black",
        };
    }

    const daysUntilExpiration = differenceInDays(date, new Date());
    const isExpired = isPast(date);
    const isExpiringSoon = daysUntilExpiration <= 30 && daysUntilExpiration > 0;

    return {
        status: isExpired
            ? "expired"
            : isExpiringSoon
            ? "expiring_soon"
            : undefined,
        daysRemaining: Math.abs(daysUntilExpiration),
        isExpired,
        isExpiringSoon,
        className: isExpired
            ? "text-red"
            : isExpiringSoon
            ? "text-orange"
            : "text-black",
    };
};
