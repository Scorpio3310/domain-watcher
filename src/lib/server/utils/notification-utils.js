/**
 * @fileoverview Notification delivery helpers shared by the notifiers
 * (notifications/providers), the provider clients (infrastructure) and the
 * cron: message-size helpers for webhook payloads/errors and the daily
 * report schedule rules. Kept outside notifications/providers so the
 * infrastructure clients don't depend on the notifier modules.
 * @module NotificationUtils
 */

import { getLocalDateTime, getTimezone } from "#lib/utils/helpers.js";
import { NOTIFICATION_CATCH_UP_MINUTES } from "#lib/constants/constants.js";

/** @import { ScheduleDecision } from "#lib/types.js" */

// ========================================
// MESSAGE TEXT
// ========================================

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
 * Join list lines, stopping before the text would exceed the character budget
 * @param {string[]} lines - Rendered list lines, in display order
 * @param {number} maxChars - Character budget for the joined text
 * @param {{truncateOversizedFirstLine?: boolean}} [options={}] - With
 *   truncateOversizedFirstLine, a first line that alone exceeds the budget is
 *   cut to fit (for containers that need non-empty text, e.g. a Slack section)
 *   instead of returning empty text
 * @returns {{text: string, shown: number}} Joined text and how many lines fit
 * @example
 * joinLinesWithinLimit(["• a.com", "• b.com"], 10) // { text: "• a.com", shown: 1 }
 * joinLinesWithinLimit(["• very-long.com"], 8, { truncateOversizedFirstLine: true })
 * // { text: "• very-…", shown: 1 }
 */
export const joinLinesWithinLimit = (
    lines,
    maxChars,
    { truncateOversizedFirstLine = false } = {}
) => {
    let text = "";
    let shown = 0;
    for (const line of lines) {
        const next = shown === 0 ? line : `${text}\n${line}`;
        if (next.length > maxChars) break;
        text = next;
        shown++;
    }

    if (
        truncateOversizedFirstLine &&
        shown === 0 &&
        lines.length > 0 &&
        maxChars > 0
    )
        return { text: truncateError(lines[0], maxChars), shown: 1 };

    return { text, shown };
};

/**
 * Short, single-line detail from a failed HTTP response body: its JSON
 * `message` when present (Discord), otherwise the plain text (Slack). The raw
 * body is never passed on (it can be large or an HTML error page).
 * @param {string} body - Response body text
 * @param {number} [maxLength=100] - Maximum detail length
 * @returns {string} Collapsed, truncated detail ("" for empty or HTML bodies)
 * @example
 * summarizeErrorBody("invalid_payload") // "invalid_payload"
 * summarizeErrorBody('{"message": "Unknown Webhook", "code": 10015}') // "Unknown Webhook"
 * summarizeErrorBody("<html>...</html>") // ""
 */
export const summarizeErrorBody = (body, maxLength = 100) => {
    let detail = body;
    try {
        const parsed = JSON.parse(body);
        if (typeof parsed?.message === "string") detail = parsed.message;
    } catch {
        // Not JSON - fall back to the plain text body
    }
    detail = detail.replace(/\s+/g, " ").trim();
    return detail.startsWith("<") ? "" : truncateError(detail, maxLength);
};

/**
 * Failure message for a non-2xx API/webhook response: status plus a short
 * summary of the body (log the full body separately with console.error)
 * @param {string} service - Service label, e.g. "Slack"
 * @param {number} status - HTTP status code
 * @param {string} body - Response body text
 * @returns {string} e.g. "Slack API error (404): no_service"
 */
export const formatApiError = (service, status, body) => {
    const detail = summarizeErrorBody(body);
    return `${service} API error (${status})${detail ? `: ${detail}` : ""}`;
};

// ========================================
// DAILY REPORT SCHEDULE
// ========================================

const MINUTES_PER_DAY = 24 * 60;

/**
 * Parse a zero-padded 24-hour "HH:MM" time into minutes since midnight
 * @param {string|null|undefined} time - Time string, e.g. "09:30"
 * @returns {number|null} Minutes since midnight, or null when not valid HH:MM
 * @example
 * parseTimeToMinutes("09:30") // 570
 * parseTimeToMinutes("9:30") // null
 */
export const parseTimeToMinutes = (time) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time ?? "");
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

/**
 * Shift a "YYYY-MM-DD" calendar date by whole days (pure calendar math)
 * @param {string} date - Calendar date "YYYY-MM-DD"
 * @param {number} days - Days to add (negative to subtract)
 * @returns {string} Shifted calendar date "YYYY-MM-DD"
 * @example
 * addDaysToDate("2026-03-01", -1) // "2026-02-28"
 */
export const addDaysToDate = (date, days) => {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days))
        .toISOString()
        .slice(0, 10);
};

/**
 * Decide whether a provider's daily report is due on a scheduled cron tick.
 *
 * A report "slot" is the notification time on a local calendar day. A tick
 * may send it from that time until catchUpMinutes later (wall-clock minutes
 * in the configured timezone), unless last_sent_on already covers the slot's
 * day. So a failed send is retried on the next ticks, a late or missed tick
 * still delivers, a time skipped by the DST spring-forward fires right after
 * the jump, and the repeated hour on fall-back can't send twice. Yesterday's
 * slot is considered too, so a window that runs past midnight (e.g. 23:30)
 * still catches up after 00:00.
 *
 * @param {Object} params - Schedule inputs
 * @param {string|null|undefined} params.notificationTime - Configured time "HH:MM"
 * @param {string|null|undefined} params.lastSentOn - Local date "YYYY-MM-DD" of the last claimed slot
 * @param {Date} [params.now=new Date()] - Current instant
 * @param {string} [params.timeZone=getTimezone()] - IANA timezone of the schedule
 * @param {number} [params.catchUpMinutes=NOTIFICATION_CATCH_UP_MINUTES] - Catch-up window length
 * @returns {ScheduleDecision} Whether to send now, the slot to claim, and why
 * @example
 * // 09:05 in Ljubljana, scheduled 09:00, last sent yesterday
 * getScheduleDecision({ notificationTime: "09:00", lastSentOn: "2026-10-17", now, timeZone: "Europe/Ljubljana" })
 * // { due: true, reason: "due", slotDate: "2026-10-18", minutesLate: 5, ... }
 */
export const getScheduleDecision = ({
    notificationTime,
    lastSentOn,
    now = new Date(),
    timeZone = getTimezone(),
    catchUpMinutes = NOTIFICATION_CATCH_UP_MINUTES,
}) => {
    const local = getLocalDateTime(now, timeZone);
    const base = { localDate: local.date, localTime: local.time };
    const scheduledMinutes = parseTimeToMinutes(notificationTime);

    if (scheduledMinutes === null) {
        return {
            ...base,
            due: false,
            reason: "no_time",
            slotDate: null,
            minutesLate: null,
        };
    }

    const todayLate = local.minutes - scheduledMinutes;
    const slot = [
        { slotDate: local.date, minutesLate: todayLate },
        {
            slotDate: addDaysToDate(local.date, -1),
            minutesLate: todayLate + MINUTES_PER_DAY,
        },
    ].find(
        ({ minutesLate }) => minutesLate >= 0 && minutesLate <= catchUpMinutes
    );

    // YYYY-MM-DD strings compare chronologically
    const sentOn = lastSentOn ?? "";

    if (slot) {
        return {
            ...base,
            ...slot,
            due: sentOn < slot.slotDate,
            reason: sentOn < slot.slotDate ? "due" : "already_sent",
        };
    }

    return {
        ...base,
        due: false,
        reason:
            sentOn >= local.date
                ? "already_sent"
                : todayLate < 0
                  ? "before_time"
                  : "outside_window",
        slotDate: null,
        minutesLate: null,
    };
};

/**
 * Schedule state to store when a provider's settings are saved with a
 * notification time that is still ahead today (local time): yesterday's
 * date, so today's report goes out at that time even if one was already sent
 * earlier today at the old time (and yesterday's slot can't catch up).
 * Returns null otherwise, meaning "keep the stored state". The settings
 * UPDATE applies it only when notification_time actually changed.
 * @param {string} notificationTime - Saved notification time "HH:MM"
 * @param {Date} [now=new Date()] - Current instant
 * @param {string} [timeZone=getTimezone()] - IANA timezone of the schedule
 * @returns {string|null} Date "YYYY-MM-DD" to store as last_sent_on, or null
 * @example
 * // At 10:00 local on 2026-10-18
 * getScheduleResetDate("15:00") // "2026-10-17" (today's report at 15:00)
 * getScheduleResetDate("08:00") // null (already passed - keep the state)
 */
export const getScheduleResetDate = (
    notificationTime,
    now = new Date(),
    timeZone = getTimezone()
) => {
    const scheduledMinutes = parseTimeToMinutes(notificationTime);
    const local = getLocalDateTime(now, timeZone);
    return scheduledMinutes !== null && scheduledMinutes > local.minutes
        ? addDaysToDate(local.date, -1)
        : null;
};

/**
 * Schedule state to seed when a provider is saved for the first time (no
 * stored last_sent_on yet) with a notification time that already passed
 * today: today's local date, so the first scheduled report goes out tomorrow
 * instead of right after the save (the 60-minute catch-up window would
 * otherwise send it within a minute). Returns null when the time is still
 * ahead today - an empty state already means "due today".
 * @param {string} notificationTime - Saved notification time "HH:MM"
 * @param {Date} [now=new Date()] - Current instant
 * @param {string} [timeZone=getTimezone()] - IANA timezone of the schedule
 * @returns {string|null} Date "YYYY-MM-DD" to store as last_sent_on, or null
 * @example
 * // At 10:00 local on 2026-10-18
 * getScheduleSeedDate("08:00") // "2026-10-18" (first report tomorrow)
 * getScheduleSeedDate("15:00") // null (today's report at 15:00)
 */
export const getScheduleSeedDate = (
    notificationTime,
    now = new Date(),
    timeZone = getTimezone()
) => {
    const scheduledMinutes = parseTimeToMinutes(notificationTime);
    const local = getLocalDateTime(now, timeZone);
    return scheduledMinutes !== null && scheduledMinutes <= local.minutes
        ? local.date
        : null;
};
