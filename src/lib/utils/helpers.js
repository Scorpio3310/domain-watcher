import { PUBLIC_ENVIRONMENT, PUBLIC_TIMEZONE } from "$app/env/public";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import { EXPIRY_WARNING_DAYS } from "#lib/constants/constants.js";

// ============================================================================
// UTILITY FUNCTIONS (internal helpers)
// ============================================================================

/**
 * Validated timezone, resolved once (PUBLIC_TIMEZONE is inlined at build time)
 * @type {string|undefined}
 */
let resolvedTimezone;

/**
 * Timezone for displayed dates and notification schedules: PUBLIC_TIMEZONE,
 * or "UTC" when it is unset or not a zone Intl accepts (warns once instead
 * of letting every date format throw a RangeError)
 * @returns {string} IANA timezone name
 * @example
 * // PUBLIC_TIMEZONE="Europe/Ljubljana"
 * getTimezone() // "Europe/Ljubljana"
 *
 * // PUBLIC_TIMEZONE unset, or a typo like "Europe/Ljubjana"
 * getTimezone() // "UTC" (the typo also logs one warning)
 */
export const getTimezone = () => {
    if (resolvedTimezone) return resolvedTimezone;

    const configured = PUBLIC_TIMEZONE?.trim() || "UTC";
    try {
        // resolvedOptions() returns the canonical spelling ("europe/ljubljana"
        // -> "Europe/Ljubljana") for display in toasts and helper texts
        resolvedTimezone = new Intl.DateTimeFormat("en-GB", {
            timeZone: configured,
        }).resolvedOptions().timeZone;
    } catch {
        console.warn(
            `⚠️ Invalid PUBLIC_TIMEZONE "${configured}" - falling back to UTC`
        );
        resolvedTimezone = "UTC";
    }
    return resolvedTimezone;
};

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
 * Extract a human-readable message from an unknown error value
 * @param {unknown} error - Caught error of unknown shape
 * @param {string} [fallback="Unknown error"] - Message when none can be extracted
 * @returns {string} Extracted error message or the fallback
 */
export const getErrorMessage = (error, fallback = "Unknown error") => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object") {
        const obj = /** @type {Record<string, unknown>} */ (error);
        if (typeof obj.originalMessage === "string") return obj.originalMessage;
        if (typeof obj.message === "string") return obj.message;
    }
    return typeof error === "string" ? error : fallback;
};

/**
 * Extract an HTTP status code from an unknown error value
 * @param {unknown} error - Caught error of unknown shape
 * @param {number} [fallback=500] - Status when none can be extracted
 * @returns {number} Extracted status code or the fallback
 */
export const getHttpStatus = (error, fallback = 500) =>
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (/** @type {Record<string, unknown>} */ (error).status) === "number"
        ? /** @type {{status: number}} */ (error).status
        : fallback;

/**
 * Calendar date and wall-clock time of an instant in a timezone
 * @param {Date} [date=new Date()] - Instant to convert
 * @param {string} [timeZone=getTimezone()] - IANA timezone (defaults to the validated PUBLIC_TIMEZONE)
 * @returns {import('#lib/types.js').LocalDateTime} Local date, time and minutes since local midnight
 * @example
 * // 01:30 UTC on 29 March 2026 is 03:30 CEST (clocks sprang forward at 02:00)
 * getLocalDateTime(new Date("2026-03-29T01:30:00Z"), "Europe/Ljubljana")
 * // { date: "2026-03-29", time: "03:30", minutes: 210 }
 */
export const getLocalDateTime = (
    date = new Date(),
    timeZone = getTimezone()
) => {
    /** @type {Record<string, string>} */
    const parts = {};
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    });
    for (const { type, value } of formatter.formatToParts(date)) {
        parts[type] = value;
    }

    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        time: `${parts.hour}:${parts.minute}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
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
        /** @type {Intl.DateTimeFormatOptions} */
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days until a domain expires — the ONE day-count rule shared by the UI
 * (formatExpirationDate, getExpirationStatus) and the notification reports.
 * Future: any started day counts as a full day (Math.ceil) — expiring in 16h
 * → 1, in 9.5 days → 10 — so 1..EXPIRY_WARNING_DAYS lines up exactly with the
 * report's "expires within EXPIRY_WARNING_DAYS × 24h" window.
 * Past: whole days elapsed (Math.floor), but at least 1 — expired 12h ago →
 * -1, 36h ago → -1, 9.5 days ago → -9 — so an expired domain never reads
 * "0 days ago" and the elapsed time is never overstated.
 * Pure arithmetic on instants — browser-safe and timezone-independent.
 * @function getDaysUntilExpiration
 * @param {string|Date|null} expirationDate - Domain expiration date
 * @param {boolean} [assumeUTC=true] - Whether to assume input is UTC if no timezone specified
 * @returns {number|null} Signed whole days (negative = expired, ≤ -1; 0 only
 *   at the exact expiry instant) or null if the date is missing/invalid
 * @example
 * // Assuming now is 2025-07-29T12:00:00Z
 * getDaysUntilExpiration('2025-07-30T04:00:00Z') // 1 (16 hours left)
 * getDaysUntilExpiration('2025-08-15T12:00:00Z') // 17
 * getDaysUntilExpiration('2025-07-29T00:00:00Z') // -1 (expired 12 hours ago)
 * getDaysUntilExpiration('2025-07-28T00:00:00Z') // -1 (expired 36 hours ago)
 * getDaysUntilExpiration('2025-07-20T00:00:00Z') // -9 (expired 9.5 days ago)
 * getDaysUntilExpiration(null) // null
 */
export const getDaysUntilExpiration = (expirationDate, assumeUTC = true) => {
    const date = parseDate(expirationDate, assumeUTC);
    if (!date || !isValid(date)) return null;

    const diffMs = date.getTime() - Date.now();
    if (diffMs >= 0) return Math.ceil(diffMs / MS_PER_DAY);
    return -Math.max(1, Math.floor(-diffMs / MS_PER_DAY));
};

/**
 * Formats expiration date with intelligent remaining time information.
 * Day counts follow getDaysUntilExpiration (remaining days round up, elapsed
 * days round down but never below 1).
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
 * // Expired domain (all examples assume now is 2025-07-29T00:00:00Z)
 * formatExpirationDate('2025-07-20')
 * // Returns: "20 July 2025 (expired 9 days ago)"
 *
 * @example
 * // Future expiration
 * formatExpirationDate('2025-08-15')
 * // Returns: "15 August 2025 (17 days remaining)"
 *
 * @example
 * // Expiring later today / expired a few hours ago (never "0 days")
 * formatExpirationDate('2025-07-29T16:00:00Z', { onlyRemaining: true })
 * // Returns: "1 day remaining"
 * formatExpirationDate('2025-07-28T20:00:00Z', { onlyRemaining: true })
 * // Returns: "expired 1 day ago"
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
        const daysUntilExpiration = getDaysUntilExpiration(date, false) ?? 0;
        const isExpired = daysUntilExpiration < 0;
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
 * Analyzes expiration status and provides styling information.
 * Day counts follow getDaysUntilExpiration; "expiring soon" means within
 * EXPIRY_WARNING_DAYS, the same window the notification reports use.
 * @function getExpirationStatus
 * @param {string|Date|null} expirationDate - Domain expiration date
 * @param {boolean} [assumeUTC=true] - Whether to assume input is UTC
 * @returns {import('#lib/types.js').ExpirationStatus} Comprehensive status object with expiration analysis and UI styling
 * @example
 * // Expired domain (all examples assume now is 2025-07-29T00:00:00Z)
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
 * // Expiring soon (within EXPIRY_WARNING_DAYS)
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
 * // Edge cases - expiring later today (16 hours left)
 * getExpirationStatus('2025-07-29T16:00:00Z')
 * // Returns: {
 * //   status: 'expiring_soon',
 * //   daysRemaining: 1,
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

    const daysUntilExpiration = getDaysUntilExpiration(date, false) ?? 0;
    const isExpired = daysUntilExpiration < 0;
    const isExpiringSoon =
        !isExpired && daysUntilExpiration <= EXPIRY_WARNING_DAYS;

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
