import { Resend } from "resend";
import { PRODUCTION_DOMAIN } from "$app/env/private";
import { getErrorMessage } from "#lib/utils/helpers.js";
import { NOTIFICATION_SEND_TIMEOUT_MS } from "#lib/server/utils/notification-utils.js";
import {
    escapeHtml,
    formatExpiryDetail,
    formatMoreText,
    getQuietMessage,
    getReportTimestamp,
    truncateError,
} from "./shared.js";

/** @import { CheckFailure, DomainRecord, DomainUpdates, NotifierResult } from "#lib/types.js" */

/**
 * Short, stable fingerprint of a string (32-bit FNV-1a, hex) - keeps the
 * sender/recipient out of the idempotency key while still changing it when
 * they change
 * @param {string} value - Text to fingerprint
 * @returns {string} 8-character hex hash
 */
const fingerprint = (value) => {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
};

/**
 * Idempotency key for a scheduled daily report, so a send that Resend
 * accepted but whose response was lost (network reset, our timeout) can't be
 * delivered twice by the next tick's retry. Includes the notification time
 * (an intended re-send after a time change still goes out) and a fingerprint
 * of the deployment (PRODUCTION_DOMAIN) + sender + recipient (a retry after
 * fixing them gets a fresh key, and two instances sharing a Resend account,
 * e.g. local and production, can't block each other's report).
 * @param {{from_email: string, to_email: string, notification_time?: string}} settings - Resend settings
 * @param {string} slotDate - Local date "YYYY-MM-DD" of the scheduled report slot
 * @returns {string} e.g. "daily-report/2026-10-18/09:00/1a2b3c4d"
 */
const getDailyReportIdempotencyKey = (settings, slotDate) =>
    `daily-report/${slotDate}/${settings.notification_time ?? "-"}/${fingerprint(
        `${PRODUCTION_DOMAIN}\n${settings.from_email}\n${settings.to_email}`
    )}`;

/**
 * Report timestamp of a scheduled slot ("18 October 2026 at 09:00"), the same
 * format as getReportTimestamp() but stable across retries of that slot
 * @param {string} slotDate - Local date "YYYY-MM-DD" of the scheduled report slot
 * @param {string|undefined} notificationTime - Scheduled local time "HH:MM"
 * @returns {string} Human-readable slot timestamp
 */
const formatSlotTimestamp = (slotDate, notificationTime) => {
    const day = new Date(`${slotDate}T12:00:00Z`).toLocaleDateString("en-GB", {
        timeZone: "UTC",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
    return notificationTime ? `${day} at ${notificationTime}` : day;
};

/**
 * Resend Email notification service for formatting and sending messages
 */
export const resendNotifier = {
    /**
     * Send domain monitoring report via Resend Email
     * @param {{api_key: string, from_email: string, to_email: string, notification_time?: string}} settings - Resend settings object
     * @param {DomainUpdates} domainUpdates - Domain update data
     * @param {{slotDate?: string}} [options={}] - slotDate: scheduled report
     *   slot (scheduled cron runs only) - sends with an idempotency key so a
     *   retried send can't deliver the same daily report twice
     * @returns {Promise<NotifierResult & {data?: {emailId: string, from: string, to: string, sentAt: string}}>} Send result
     */
    async sendDomainReport(settings, domainUpdates, { slotDate } = {}) {
        try {
            if (
                !settings?.api_key ||
                !settings?.to_email ||
                !settings?.from_email
            ) {
                return {
                    success: false,
                    message:
                        "Resend API key, sender or recipient email not configured",
                };
            }

            // Initialize Resend client
            const resend = new Resend(settings.api_key);

            // Scheduled reports show the slot time instead of "now", so a
            // retry renders the same email and Resend replays the first
            // attempt's response for the idempotency key below
            const emailContent = this.formatEmailContent(
                domainUpdates,
                slotDate
                    ? formatSlotTimestamp(slotDate, settings.notification_time)
                    : getReportTimestamp()
            );

            const failureCount = domainUpdates.failures?.length ?? 0;
            const updateCount = domainUpdates.totalCount + failureCount;
            const emailData = {
                from: settings.from_email,
                to: [settings.to_email],
                subject:
                    updateCount === 0
                        ? "🌐 Domain Watcher: All quiet on the digital front! 🤠"
                        : `🌐 Domain Watcher Report - ${updateCount} update${
                              updateCount !== 1 ? "s" : ""
                          } need your attention!`,
                html: emailContent.html,
                text: emailContent.text,
            };

            // Send email using Resend SDK. A stalled request is aborted (the
            // SDK returns it as an error), so the cron can retry on its next
            // tick; scheduled reports carry an idempotency key for that retry
            const { data, error } = await resend.emails.send(emailData, {
                signal: AbortSignal.timeout(NOTIFICATION_SEND_TIMEOUT_MS),
                ...(slotDate && {
                    idempotencyKey: getDailyReportIdempotencyKey(
                        settings,
                        slotDate
                    ),
                }),
            });

            if (error) {
                console.error("❌ Resend email failed:", error);

                // Map known Resend API error names to friendly messages
                /** @type {Record<string, string>} */
                const knownErrors = {
                    missing_api_key: "Invalid API key",
                    invalid_api_key: "Invalid API key",
                    restricted_api_key: "Invalid API key",
                    rate_limit_exceeded: "Rate limit exceeded",
                    daily_quota_exceeded: "Daily email quota exceeded",
                    monthly_quota_exceeded: "Monthly email quota exceeded",
                    invalid_from_address: "Invalid 'from' email address",
                    concurrent_idempotent_requests:
                        "An earlier send of this report is still in progress",
                    // Same key, different content (the domain data changed
                    // between attempts) - reported as a failure rather than
                    // assumed delivered, so a lost report is never silent
                    invalid_idempotent_request:
                        "An earlier attempt for this report used different content (idempotency conflict)",
                };
                const errorMessage =
                    knownErrors[error.name] ||
                    error.message ||
                    "Unknown error occurred";

                return {
                    success: false,
                    message: `Resend API error: ${errorMessage}`,
                };
            }

            if (data && data.id) {
                console.log(
                    "✅ Resend domain report sent successfully, ID:",
                    data.id
                );
                return {
                    success: true,
                    message: "Domain report sent via Resend successfully",
                    data: {
                        emailId: data.id,
                        from: settings.from_email,
                        to: settings.to_email,
                        sentAt: new Date().toISOString(),
                    },
                };
            }

            console.warn("⚠️ Resend email sent but no data returned");
            return {
                success: false,
                message: "Email sent but response was unexpected",
            };
        } catch (error) {
            console.error("❌ Failed to send Resend notification:", error);

            // Handle network/connection errors
            const errorCode =
                error && typeof error === "object" && "code" in error
                    ? error.code
                    : undefined;
            if (errorCode === "ENOTFOUND" || errorCode === "ECONNREFUSED") {
                return {
                    success: false,
                    message:
                        "Failed to connect to Resend API - check your internet connection",
                };
            }

            return {
                success: false,
                message: `Failed to send email: ${getErrorMessage(error)}`,
            };
        }
    },

    /**
     * Format domain updates into email content (HTML + Text)
     * @param {DomainUpdates} domainUpdates - Domain update data
     * @param {string} [timestamp=getReportTimestamp()] - Report timestamp shown in the email
     * @returns {{html: string, text: string}} Email content in both formats
     */
    formatEmailContent(domainUpdates, timestamp = getReportTimestamp()) {
        const {
            available = [],
            expiring = [],
            expired = [],
            failures = [],
            totalCount,
        } = domainUpdates;

        // Generate HTML version
        const html = this.generateHtmlContent(timestamp, totalCount, {
            available,
            expiring,
            expired,
            failures,
        });

        // Generate text version
        const text = this.generateTextContent(timestamp, totalCount, {
            available,
            expiring,
            expired,
            failures,
        });

        return { html, text };
    },

    /**
     * Generate modern HTML email content with new template
     * @param {string} timestamp - Human-readable report timestamp
     * @param {number} totalCount - Total number of domain updates
     * @param {{available: DomainRecord[], expiring: DomainRecord[], expired: DomainRecord[], failures: CheckFailure[]}} domainGroups - Categorized domains + failed checks
     * @returns {string} HTML email content
     */
    generateHtmlContent(
        timestamp,
        totalCount,
        { available, expiring, expired, failures }
    ) {
        const sections = [
            {
                domains: expired,
                title: "🚨 Expired but Still Registered",
                color: "#ED0000",
                bgColor: "#F9E1E1",
            },
            {
                domains: available,
                title: "🟢 Available Domains",
                color: "#2BA805",
                bgColor: "#E6F4E2",
            },
            {
                domains: expiring,
                title: "⚠️ Expiring Soon",
                color: "#EB700A",
                bgColor: "#F9EDE2",
            },
        ];

        const sectionsHtml = sections
            .filter(({ domains }) => domains.length > 0)
            .map(({ domains, title, color, bgColor }) => {
                const domainList = domains
                    .slice(0, 20)
                    .map((domain) => {
                        const domainName = escapeHtml(domain.domain_name);

                        // formatDate falls back to the raw stored value, so
                        // the detail is escaped too
                        return domain.expires
                            ? `<li><strong>${domainName}</strong> - ${escapeHtml(
                                  formatExpiryDetail(domain.expires)
                              )}</li>`
                            : `<li><strong>${domainName}</strong></li>`;
                    })
                    .join("");

                const moreText =
                    domains.length > 20
                        ? `<p style="color: #1a1a1a; font-style: italic; margin: 0; font-size: 13px; opacity: 0.5;">${formatMoreText(
                              domains.length - 20,
                              "domain",
                              "domains"
                          )}</p>`
                        : "";

                return `
                    <div style="font-size: 14px; background-color: ${bgColor}; padding: 16px; border-radius: 16px; margin-bottom: 12px;">
                        <p style="margin: 0; font-weight: 600; color: ${color};">
                            ${title} (${domains.length})
                        </p>
                        <ul style="margin: 0; padding-left: 20px; color: #1A1A1A;">
                            ${domainList}
                        </ul>
                        ${moreText}
                    </div>
                `;
            })
            .join("");

        // Failed checks are shown explicitly — a lookup/DB hiccup must never
        // masquerade as a quiet day
        const failureItems = failures
            .slice(0, 20)
            .map(
                (failure) =>
                    `<li><strong>${escapeHtml(
                        failure.domain_name
                    )}</strong> - ${escapeHtml(
                        truncateError(failure.error)
                    )}</li>`
            )
            .join("");

        const failuresMoreText =
            failures.length > 20
                ? `<p style="color: #1a1a1a; font-style: italic; margin: 0; font-size: 13px; opacity: 0.5;">${formatMoreText(
                      failures.length - 20,
                      "check failure",
                      "check failures"
                  )}</p>`
                : "";

        const failuresHtml =
            failures.length > 0
                ? `
                    <div style="font-size: 14px; background-color: #EFEFEF; padding: 16px; border-radius: 16px; margin-bottom: 12px;">
                        <p style="margin: 0; font-weight: 600; color: #5A5A5A;">
                            ⛔ Check Failures (${failures.length})
                        </p>
                        <ul style="margin: 0; padding-left: 20px; color: #1A1A1A;">
                            ${failureItems}
                        </ul>
                        ${failuresMoreText}
                    </div>
                `
                : "";

        const noUpdatesContent =
            totalCount === 0 && failures.length === 0
                ? `
            <div style="text-align: center; padding: 40px 20px; color: #1A1A1A;">
                <p style="font-size: 18px; margin: 0 0 8px 0; font-weight: 600;">
                    ${getQuietMessage()}
                </p>
                <p style="font-size: 14px; margin: 0; opacity: 0.7; line-height: 1.4;">
                    Your domain portfolio is having a peaceful day - no expired domains, no urgent renewals, just pure digital harmony.
                </p>
            </div>
        `
                : "";

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Domain Watcher - Daily Report</title>
</head>
<body style="background-color: #F0F0F0; margin: 0; font-family: Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="padding: 32px 16px;">
         <div style="background-color: #1A1A1A; padding: 12px; border-radius: 100px; max-width: 218px; margin: 0 auto; margin-bottom: 24px;">
            <img src="${PRODUCTION_DOMAIN}/img_logo.png" 
                 alt="Domain Watcher Logo" 
                 style="width: 218px; display: block;"
                 width="218">
        </div>
        <div style="background-color: #FFFFFF; padding: 20px; border-radius: 32px; max-width: 768px; margin: 0 auto; width: 100%;">
            <h1 style="color: #1A1A1A; font-size: 24px; margin: 0; line-height: 1.3;">
                Domain Detective Report 🕵️
            </h1>
            <p style="color: #1A1A1A; font-size: 14px; margin-top: 12px; margin-bottom: 0px; opacity: 0.7; line-height: 1.4;">
                Date: ${timestamp} • ${totalCount} domain update${
            totalCount !== 1 ? "s" : ""
        }${
            failures.length > 0
                ? ` • ${failures.length} check failure${
                      failures.length !== 1 ? "s" : ""
                  }`
                : ""
        }
            </p>
            <hr style="border: 1px dashed #1A1A1A; opacity: 0.10; margin: 16px 0px"/>

            ${sectionsHtml}${failuresHtml}${noUpdatesContent}

            <hr style="border: 1px dashed #1A1A1A; opacity: 0.10; margin: 16px 0px"/>
            <p style="color: #1A1A1A; font-size: 14px; line-height: 1.5; margin: 0; opacity: 0.5;">
                This is an automated report from your Domain Watcher system
            </p>
        </div>
    </div>
</body>
</html>
        `.trim();
    },

    /**
     * Generate plain text email content
     * @param {string} timestamp - Human-readable report timestamp
     * @param {number} totalCount - Total number of domain updates
     * @param {{available: DomainRecord[], expiring: DomainRecord[], expired: DomainRecord[], failures: CheckFailure[]}} domainGroups - Categorized domains + failed checks
     * @returns {string} Plain text email content
     */
    generateTextContent(
        timestamp,
        totalCount,
        { available, expiring, expired, failures }
    ) {
        const sections = [
            { domains: expired, title: "🚨 EXPIRED BUT STILL REGISTERED" },
            { domains: available, title: "🟢 AVAILABLE DOMAINS" },
            { domains: expiring, title: "⚠️ EXPIRING SOON" },
        ];

        const sectionsText = sections
            .filter(({ domains }) => domains.length > 0)
            .map(({ domains, title }) => {
                const domainList = domains
                    .slice(0, 20)
                    .map((domain) =>
                        domain.expires
                            ? `• ${domain.domain_name} - ${formatExpiryDetail(
                                  domain.expires
                              )}`
                            : `• ${domain.domain_name}`
                    )
                    .join("\n");

                const moreText =
                    domains.length > 20
                        ? `\n${formatMoreText(domains.length - 20, "domain", "domains")}`
                        : "";

                return `\n${title} (${domains.length}):\n${domainList}${moreText}\n`;
            })
            .join("\n" + "=".repeat(50) + "\n");

        const failureList = failures
            .slice(0, 20)
            .map(
                (failure) =>
                    `• ${failure.domain_name} - ${truncateError(failure.error)}`
            )
            .join("\n");

        const failuresMoreText =
            failures.length > 20
                ? `\n${formatMoreText(failures.length - 20, "check failure", "check failures")}`
                : "";

        const failuresText =
            failures.length > 0
                ? `\n⛔ CHECK FAILURES (${failures.length}):\n${failureList}${failuresMoreText}\n`
                : "";

        const quietText =
            totalCount === 0 && failures.length === 0
                ? `${getQuietMessage()}

Your domain portfolio is having a peaceful day - no expired domains, no urgent renewals, just pure digital harmony.`
                : "";

        return `
Domain Watcher - Daily Report
${timestamp} • ${totalCount} domain update${totalCount !== 1 ? "s" : ""}${
            failures.length > 0
                ? ` • ${failures.length} check failure${
                      failures.length !== 1 ? "s" : ""
                  }`
                : ""
        }

${"=".repeat(50)}
${totalCount > 0 ? sectionsText : ""}${failuresText}${quietText}

${"=".repeat(50)}

This is an automated report from your Domain Watcher system.
        `.trim();
    },
};
