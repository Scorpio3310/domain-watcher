import { executeSql } from "$src/lib/database/db";
import { SETTINGS_QUERIES } from "$src/lib/database/settings-queries";
import { isDemo } from "$src/lib/utils/helpers";
import { RESEND_CONNECTION_STATUS } from "$lib/constants/constants";
import { maskApiKey } from "$lib/utils/helpers";
import { Resend } from "resend";

// ========================================
// CORE UTILITIES
// ========================================
/**
 * Validates demo mode for write operations
 */
const validateDemoAccess = () =>
    isDemo()
        ? { status: 403, message: "Demo mode: Look but don't touch 👀" }
        : null;

/**
 * Creates Resend configuration object
 */
const createResendConfiguration = ({
    apiKey = "",
    notificationTime = "",
    fromEmail = "",
    toEmail = "",
    connectionStatus = RESEND_CONNECTION_STATUS.SETUP_REQUIRED,
    verifiedAt = null,
    version = 1,
} = {}) => ({
    api_key: apiKey,
    notification_time: notificationTime,
    from_email: fromEmail,
    to_email: toEmail,
    connection_status: connectionStatus,
    connection_verified_at: verifiedAt,
    version,
});

// ========================================
// RESEND EMAIL TESTING
// ========================================

/**
 * Tests Resend email configuration by sending a test email
 * @async
 * @function testResendEmail
 * @param {string} apiKey - Resend API key
 * @param {string} fromEmail - From email address
 * @param {string} toEmail - To email address
 * @param {string} notificationTime - Notification time in HH:MM format
 * @returns {Promise<Object>} Success object or error object
 *
 * @example
 * const result = await testResendEmail(
 *   "re_AbCdEf123456",
 *   "notifications@yourdomain.com",
 *   "admin@yourdomain.com",
 *   "14:30"
 * );
 */
export async function testResendEmail(
    apiKey,
    fromEmail,
    toEmail,
    notificationTime
) {
    try {
        // Input validation
        if (!apiKey || typeof apiKey !== "string") {
            return {
                status: 400,
                message:
                    "Hold up! Need that API key to make the magic happen ✨",
            };
        }

        if (!fromEmail || !toEmail) {
            return {
                status: 400,
                message:
                    "Missing email addresses! Fill in both From and To fields to get started 🚀",
            };
        }

        // Initialize Resend client
        const resend = new Resend(apiKey);

        // Create enhanced HTML email template
        const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    <title>Domain Watcher - Configuration Verified</title>
</head>
<body style="background-color: #F0F0F0; margin: 0; font-family: Figtree, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="padding: 32px 16px;">
        <div style="background-color: #1A1A1A; padding: 12px; border-radius: 100px; max-width: 218px; margin: 0 auto; margin-bottom: 24px;">
            <svg fill=none viewBox="0 0 195 36"xmlns=http://www.w3.org/2000/svg><path d="M18.198 0h.564c2.764.042 5.517.724 7.97 1.996a18.1 18.1 0 0 1 6.062 5.086 17.9 17.9 0 0 1 3.528 8.54c.103.736.13 1.48.178 2.221v.285c-.047.739-.075 1.48-.176 2.216a17.9 17.9 0 0 1-3.05 7.891 18.1 18.1 0 0 1-5.444 5.128 17.9 17.9 0 0 1-7.59 2.53c-.529.052-1.06.068-1.59.107h-.307c-.61-.04-1.22-.062-1.828-.13a17.9 17.9 0 0 1-5.884-1.696 18.04 18.04 0 0 1-9.217-10.51A18 18 0 0 1 .5 18.267v-.621c.028-1.145.152-2.288.392-3.409a17.9 17.9 0 0 1 3.442-7.35 18.07 18.07 0 0 1 6.644-5.25A18 18 0 0 1 18.198 0m-2.829 3.792c-.726.633-1.33 1.396-1.848 2.205-.687 1.076-1.226 2.243-1.654 3.444a23.3 23.3 0 0 0-.982 3.77 1.3 1.3 0 0 1-.903 1.005 1.24 1.24 0 0 1-1.065-.186 1.18 1.18 0 0 1-.484-.854c-.018-.182.026-.36.056-.537.323-1.775.813-3.524 1.513-5.188.531-1.258 1.182-2.47 1.992-3.573a15.6 15.6 0 0 0-6.592 5.746 15.45 15.45 0 0 0-2.392 7.1l8.744-.001a5.62 5.62 0 0 0 5.503-4.974c.051-.412.032-.828.036-1.242V2.657c-.714.235-1.36.645-1.924 1.136m4.385 7.393a5.623 5.623 0 0 0 4.495 5.426c.73.16 1.48.102 2.222.112-.13-2.874-.675-5.751-1.801-8.407-.546-1.272-1.23-2.495-2.12-3.56-.754-.893-1.68-1.687-2.798-2.077q.001 4.253.002 8.506m5.22-7.307q.075.089.143.185c.82 1.155 1.472 2.422 2 3.734 1.13 2.837 1.688 5.882 1.816 8.926h5.034a15.47 15.47 0 0 0-2.92-7.869 15.55 15.55 0 0 0-6.073-4.976m-6.492 11.078c-.059.323-.192.628-.338.92a4.14 4.14 0 0 1-2.652 2.103l-.028-.01-.002.02c.366.087.718.23 1.045.414a4.15 4.15 0 0 1 1.98 2.606 4.154 4.154 0 0 1 3.021-3.02 4.2 4.2 0 0 1-1.203-.514 4.18 4.18 0 0 1-1.823-2.52M3.003 19.182q.055.695.169 1.382a15.5 15.5 0 0 0 3.098 7.01 15.6 15.6 0 0 0 5.722 4.523c-.868-1.186-1.557-2.496-2.108-3.857-1.156-2.876-1.72-5.968-1.843-9.058zm7.5 0c.077 1.863.335 3.721.804 5.527.36 1.378.843 2.727 1.488 3.998.556 1.085 1.225 2.123 2.074 3.003.68.7 1.49 1.302 2.424 1.61v-7.579c-.008-.642.036-1.29-.086-1.925a5.62 5.62 0 0 0-5.344-4.63c-.453-.009-.907-.002-1.36-.005m10.558 2.017a5.6 5.6 0 0 0-1.308 3.547v8.551c.935-.325 1.742-.942 2.418-1.654.78-.823 1.406-1.781 1.931-2.783 1.004-1.931 1.631-4.04 2.005-6.18.095-.514.531-.95 1.052-1.024a1.22 1.22 0 0 1 1.298.694c.13.271.117.582.051.87a25.2 25.2 0 0 1-1.343 4.838c-.563 1.426-1.273 2.801-2.182 4.04a15.598 15.598 0 0 0 7.63-7.65 15.5 15.5 0 0 0 1.36-5.266c-2.898.001-5.796-.002-8.693.002a5.62 5.62 0 0 0-4.219 2.015"fill=#FFE100 /><path d="M18.198 0h.564c2.764.042 5.517.724 7.97 1.996a18.1 18.1 0 0 1 6.062 5.086 17.9 17.9 0 0 1 3.528 8.54c.103.736.13 1.48.178 2.221v.285c-.047.739-.075 1.48-.176 2.216a17.9 17.9 0 0 1-3.05 7.891 18.1 18.1 0 0 1-5.444 5.128 17.9 17.9 0 0 1-7.59 2.53c-.529.052-1.06.068-1.59.107h-.307c-.61-.04-1.22-.062-1.828-.13a17.9 17.9 0 0 1-5.884-1.696 18.04 18.04 0 0 1-9.217-10.51A18 18 0 0 1 .5 18.267v-.621c.028-1.145.152-2.288.392-3.409a17.9 17.9 0 0 1 3.442-7.35 18.07 18.07 0 0 1 6.644-5.25A18 18 0 0 1 18.198 0m-2.829 3.792c-.726.633-1.33 1.396-1.848 2.205-.687 1.076-1.226 2.243-1.654 3.444a23.3 23.3 0 0 0-.982 3.77 1.3 1.3 0 0 1-.903 1.005 1.24 1.24 0 0 1-1.065-.186 1.18 1.18 0 0 1-.484-.854c-.018-.182.026-.36.056-.537.323-1.775.813-3.524 1.513-5.188.531-1.258 1.182-2.47 1.992-3.573a15.6 15.6 0 0 0-6.592 5.746 15.45 15.45 0 0 0-2.392 7.1l8.744-.001a5.62 5.62 0 0 0 5.503-4.974c.051-.412.032-.828.036-1.242V2.657c-.714.235-1.36.645-1.924 1.136m4.385 7.393a5.623 5.623 0 0 0 4.495 5.426c.73.16 1.48.102 2.222.112-.13-2.874-.675-5.751-1.801-8.407-.546-1.272-1.23-2.495-2.12-3.56-.754-.893-1.68-1.687-2.798-2.077q.001 4.253.002 8.506m5.22-7.307q.075.089.143.185c.82 1.155 1.472 2.422 2 3.734 1.13 2.837 1.688 5.882 1.816 8.926h5.034a15.47 15.47 0 0 0-2.92-7.869 15.55 15.55 0 0 0-6.073-4.976m-6.492 11.078c-.059.323-.192.628-.338.92a4.14 4.14 0 0 1-2.652 2.103l-.028-.01-.002.02c.366.087.718.23 1.045.414a4.15 4.15 0 0 1 1.98 2.606 4.154 4.154 0 0 1 3.021-3.02 4.2 4.2 0 0 1-1.203-.514 4.18 4.18 0 0 1-1.823-2.52M3.003 19.182q.055.695.169 1.382a15.5 15.5 0 0 0 3.098 7.01 15.6 15.6 0 0 0 5.722 4.523c-.868-1.186-1.557-2.496-2.108-3.857-1.156-2.876-1.72-5.968-1.843-9.058zm7.5 0c.077 1.863.335 3.721.804 5.527.36 1.378.843 2.727 1.488 3.998.556 1.085 1.225 2.123 2.074 3.003.68.7 1.49 1.302 2.424 1.61v-7.579c-.008-.642.036-1.29-.086-1.925a5.62 5.62 0 0 0-5.344-4.63c-.453-.009-.907-.002-1.36-.005m10.558 2.017a5.6 5.6 0 0 0-1.308 3.547v8.551c.935-.325 1.742-.942 2.418-1.654.78-.823 1.406-1.781 1.931-2.783 1.004-1.931 1.631-4.04 2.005-6.18.095-.514.531-.95 1.052-1.024a1.22 1.22 0 0 1 1.298.694c.13.271.117.582.051.87a25.2 25.2 0 0 1-1.343 4.838c-.563 1.426-1.273 2.801-2.182 4.04a15.598 15.598 0 0 0 7.63-7.65 15.5 15.5 0 0 0 1.36-5.266c-2.898.001-5.796-.002-8.693.002a5.62 5.62 0 0 0-4.219 2.015"fill=url(#a) /><path d="M46.36 25V11h4.26q1.98 0 3.48.9a6.2 6.2 0 0 1 2.38 2.46q.86 1.58.86 3.64 0 2.04-.86 3.62a6.36 6.36 0 0 1-2.38 2.48q-1.5.9-3.48.9zm1.7-1.56h2.56a4.8 4.8 0 0 0 1.96-.4q.9-.42 1.58-1.18a5.5 5.5 0 0 0 1.08-1.74q.4-1 .4-2.12t-.4-2.1a5.4 5.4 0 0 0-1.08-1.76 4.6 4.6 0 0 0-1.58-1.16q-.9-.42-1.96-.42h-2.56zm16.03 1.8q-1.46 0-2.6-.66a4.8 4.8 0 0 1-1.76-1.86q-.64-1.18-.64-2.72t.62-2.72a4.7 4.7 0 0 1 1.76-1.84q1.14-.68 2.58-.68 1.48 0 2.6.68a4.5 4.5 0 0 1 1.76 1.84q.64 1.18.64 2.72t-.64 2.72a4.7 4.7 0 0 1-1.74 1.86q-1.12.66-2.58.66m0-1.48q.999 0 1.74-.48.74-.48 1.16-1.32.44-.84.44-1.96t-.44-1.96q-.42-.84-1.18-1.32t-1.76-.48q-.981 0-1.74.48-.74.48-1.18 1.32-.42.84-.42 1.96 0 1.1.42 1.96.44.84 1.2 1.32.78.48 1.76.48M71.27 25V15h1.5l.08 1.4q.46-.8 1.18-1.22t1.68-.42q1.2 0 2.04.56.86.56 1.24 1.7.42-1.1 1.22-1.68.82-.58 1.94-.58 1.68 0 2.64 1.12.98 1.12.96 3.4V25h-1.6v-5.12q0-1.48-.32-2.26-.3-.78-.82-1.06-.52-.3-1.2-.3-1.18 0-1.84.94-.66.92-.66 2.62V25h-1.6v-5.12q0-1.48-.32-2.26-.3-.78-.84-1.06-.52-.3-1.2-.3-1.16 0-1.82.94-.66.92-.66 2.62V25zm23.172 0-.08-1.64v-3.64q0-1.18-.26-1.94-.26-.78-.82-1.18t-1.46-.4q-.82 0-1.42.34-.58.32-.96 1.04l-1.44-.56q.38-.7.92-1.2.54-.52 1.26-.78.72-.28 1.64-.28 1.4 0 2.3.56.92.54 1.38 1.62.46 1.06.44 2.64l-.02 5.42zm-3 .24q-1.76 0-2.76-.8-.98-.82-.98-2.26 0-1.52 1-2.32 1.02-.82 2.84-.82h2.86v1.34h-2.5q-1.4 0-2 .46-.58.46-.58 1.32 0 .78.58 1.24.579.44 1.62.44.86 0 1.5-.36a2.5 2.5 0 0 0 .98-1.06q.36-.7.36-1.64h.68q0 2.04-.92 3.26-.92 1.2-2.68 1.2m7.135-.24V15h1.6v10zm.82-12.32a.96.96 0 0 1-.7-.3.96.96 0 0 1-.3-.7q0-.42.3-.7.3-.3.7-.3.42 0 .7.3.3.28.3.7 0 .4-.3.7-.28.3-.7.3M103.127 25V15h1.5l.1 1.84V25zm7.02 0v-5.12h1.6V25zm0-5.12q0-1.48-.34-2.26t-.94-1.06q-.6-.3-1.36-.3-1.32 0-2.06.94-.72.92-.72 2.62h-.78q0-1.58.46-2.72t1.34-1.74 2.12-.6q1.179 0 2.04.48.88.46 1.36 1.48.5 1.02.48 2.68v.48zM130.8 25l4.32-14h1.7l-4.34 14zm-8.52 0L118 11h1.7l4.24 14zm.18 0 4.12-14h1.62l-4.12 14zm8.2 0-4.02-14h1.62l4.08 14zm13.099 0-.08-1.64v-3.64q0-1.18-.26-1.94-.26-.78-.82-1.18t-1.46-.4q-.82 0-1.42.34-.579.32-.96 1.04l-1.44-.56a4.6 4.6 0 0 1 .92-1.2q.54-.52 1.26-.78.72-.28 1.64-.28 1.4 0 2.3.56.921.54 1.38 1.62.46 1.06.44 2.64l-.02 5.42zm-3 .24q-1.76 0-2.76-.8-.98-.82-.98-2.26 0-1.52 1-2.32 1.02-.82 2.84-.82h2.86v1.34h-2.5q-1.4 0-2 .46-.58.46-.58 1.32 0 .78.58 1.24.58.44 1.62.44.861 0 1.5-.36.64-.38.98-1.06.36-.7.36-1.64h.68q0 2.04-.92 3.26-.92 1.2-2.68 1.2m10.796 0q-1.46 0-2.26-.76t-.8-2.14V11.88h1.6v10.3q0 .76.4 1.18.42.4 1.16.4.24 0 .46-.06.24-.08.62-.36l.62 1.3q-.52.34-.94.46-.42.14-.86.14m-4.8-8.82V15h6.34v1.42zm13 8.82q-1.48 0-2.62-.66a4.77 4.77 0 0 1-1.78-1.86q-.64-1.18-.64-2.72t.62-2.72a4.63 4.63 0 0 1 1.78-1.84q1.14-.68 2.6-.68 1.44 0 2.58.66t1.74 1.86l-1.46.66a2.9 2.9 0 0 0-1.16-1.24q-.76-.46-1.74-.46-.981 0-1.74.48-.74.48-1.18 1.34-.42.84-.42 1.94t.42 1.96q.44.84 1.2 1.32.78.48 1.76.48t1.74-.5q.78-.5 1.18-1.4l1.46.66q-.6 1.28-1.74 2t-2.6.72m6.36-.24V11h1.6v14zm7.04 0v-5.12h1.6V25zm0-5.12q0-1.48-.36-2.26-.34-.78-.94-1.06-.6-.3-1.36-.3-1.32 0-2.06.94-.72.92-.72 2.62h-.78q0-1.58.46-2.72.48-1.14 1.36-1.74t2.12-.6q1.16 0 2.04.48.88.46 1.36 1.48.5 1.02.48 2.68v.48zm8.492 5.36q-1.46 0-2.58-.66a4.83 4.83 0 0 1-1.76-1.86q-.62-1.18-.62-2.72t.62-2.72a4.73 4.73 0 0 1 1.74-1.84q1.12-.68 2.56-.68 1.4 0 2.42.7 1.02.68 1.58 1.92t.56 2.92h-8.26l.4-.34q0 1.2.42 2.06.44.86 1.22 1.32.78.44 1.78.44 1.06 0 1.78-.5a3.3 3.3 0 0 0 1.14-1.32l1.38.7q-.38.78-1.02 1.36a4.4 4.4 0 0 1-1.48.9q-.84.32-1.88.32m-3.24-5.96-.42-.32h6.9l-.42.34q0-.96-.38-1.66a2.75 2.75 0 0 0-1.02-1.08q-.64-.38-1.48-.38-.819 0-1.56.38-.72.38-1.18 1.08-.44.68-.44 1.64m10.658.3q0-1.62.62-2.62.62-1.02 1.58-1.5.98-.5 2.06-.5v1.5q-.88 0-1.7.3-.8.28-1.32.94t-.52 1.8zm-.88 5.42V15h1.6v10z"fill=#fff /><defs><linearGradient gradientUnits=userSpaceOnUse id=a x1=.5 x2=36.5 y2=36><stop offset=0 stop-color=#FFE100 /><stop offset=1 stop-color=#84FF00 /></linearGradient></defs></svg>
        </div>
        <div style="background-color: #FFFFFF; padding: 20px; border-radius: 32px; max-width: 768px; margin: 0 auto; width: 100%;">
            <h1 style="color: #1A1A1A; font-size: 24px; margin: 0; line-height: 1.3;">
                Nice! Your email setup is locked and loaded 🚀
            </h1>
            <p style="color: #1A1A1A; font-size: 14px; margin-top: 12px; margin-bottom: 0px; opacity: 0.7; line-height: 1.4;">
                Your Domain Watcher notifications just passed the vibe check ✨
            </p>
            <hr style="border: 1px dashed #1A1A1A; opacity: 0.10; margin: 16px 0px"/>
            <p style="color: #1A1A1A; font-size: 14px; margin-top: 0px; margin-bottom: 4px;">
                Test Details:
            </p>
            <div
                style="color: #1A1A1A; font-size: 14px; margin-bottom: 4px; display: flex; flex-direction: row; gap: 4px;"
            >
                <p style="opacity: 0.5; margin: 0;">Send at:</p>
                <p style="margin: 0;">${new Date().toLocaleString()}</p>
            </div>
            <div
                style="color: #1A1A1A; font-size: 14px; margin-bottom: 4px; display: flex; flex-direction: row; gap: 4px;"
            >
                <p style="opacity: 0.5; margin: 0;">Scheduled notification time:</p>
                <p style="margin: 0;">${notificationTime}</p>
            </div>
            <div
                style="color: #1A1A1A; font-size: 14px; margin-bottom: 4px; display: flex; flex-direction: row; gap: 4px;"
            >
                <p style="opacity: 0.5; margin: 0;">From:</p>
                <p style="margin: 0;">${fromEmail}</p>
            </div>
            <div
                style="color: #1A1A1A; font-size: 14px; display: flex; flex-direction: row; gap: 4px;"
            >
                <p style="opacity: 0.5; margin: 0;">To:</p>
                <p style="margin: 0;">${toEmail}</p>
            </div>
            <hr style="border: 1px dashed #1A1A1A; opacity: 0.10; margin: 16px 0px"/>
            <p style="color: #1A1A1A; font-size: 14px; line-height: 1.5; margin: 0;">
                You're all set to catch those domain alerts at ${notificationTime} daily. No more missed renewals on our watch!
            </p>
        </div>
    </div>
</body>
</html>
        `.trim();

        // Create test email content
        const testEmailData = {
            from: fromEmail,
            to: [toEmail],
            subject: "🚀 Domain Watcher - Configuration Verified",
            html: htmlTemplate,
            text: `
Domain Watcher Test ✨

Your notifications just passed the vibe check!

Test Details:
• Sent at: ${new Date().toLocaleString()}
• Notification time: ${notificationTime}
• From: ${fromEmail}
• To: ${toEmail}

You're all set to catch those domain alerts at ${notificationTime} daily. No more missed renewals on our watch!

This is an automated test email from Domain Watcher.
            `.trim(),
        };

        // Send test email
        const { data, error } = await resend.emails.send(testEmailData);

        console.log(error);

        if (error) {
            console.error("❌ Resend email test failed:", error);

            // Handle specific Resend API errors
            let statusCode = 400;
            let errorMessage = error.error || "Unknown error occurred";

            if (error.error?.includes("API key")) {
                statusCode = 401;
                errorMessage = "Invalid API key";
            } else if (error.error?.includes("rate limit")) {
                statusCode = 429;
                errorMessage = "Rate limit exceeded";
            } else if (error.error?.includes("from_email")) {
                statusCode = 400;
                errorMessage = "Invalid 'from_email' email address";
            } else if (error.error?.includes("to_email")) {
                statusCode = 400;
                errorMessage = "Invalid 'to_email' email address";
            }

            return {
                status: statusCode,
                message: `Resend API error: ${errorMessage}`,
            };
        }

        if (data && data.id) {
            console.log("✅ Resend email test successful, ID:", data.id);

            return {
                status: 200,
                message: "Email notifications locked and loaded successfully!",
                data: {
                    emailId: data.id,
                    fromEmail: fromEmail,
                    toEmail: toEmail,
                    sentAt: new Date().toISOString(),
                },
            };
        } else {
            console.warn("⚠️ Resend email sent but no data returned");
            return {
                status: 500,
                message: "Email sent but response was unexpected",
            };
        }
    } catch (error) {
        console.error("❌ Failed to test Resend email:", error);

        // Handle network/connection errors
        if (error.code === "ENOTFOUND" || error.code === "ECONNREFUSED") {
            return {
                status: 502,
                message:
                    "Failed to connect to Resend API - check your internet connection",
            };
        }

        return {
            status: 500,
            message: `Failed to test email: ${error.message}`,
        };
    }
}

// ========================================
// RESEND SETTINGS MANAGEMENT
// ========================================

/**
 * Resend integration management operations
 * @namespace resend
 */
export const resend = {
    /**
     * Gets Resend notification enabled status
     * @async
     * @memberof resend
     * @returns {Promise<boolean>} True if enabled, false otherwise
     *
     * @example
     * const enabled = await resend.getNotificationStatus();
     * // Returns: true or false
     */
    async getNotificationStatus() {
        try {
            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_RESEND_SETTINGS
            );
            return queryResult?.results?.[0]?.enabled === 1;
        } catch (error) {
            console.error(
                "❌ Failed to get Resend notification status:",
                error
            );
            return false;
        }
    },

    /**
     * Gets Resend webhook configuration with demo mode masking
     * @async
     * @memberof resend
     * @returns {Promise<Object>} Webhook settings (masked in demo mode)
     *
     * @example
     * const getResendConfig = await resend.getResendConfig();
     * // Demo mode: { webhook_url: "https://api.resend.com/***", ... }
     * // Normal: { webhook_url: "https://api.resend.com/...", ... }
     */
    async getResendConfig() {
        try {
            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_RESEND_SETTINGS
            );
            const resendSettings = queryResult?.results?.[0];

            const config = resendSettings?.json_config_data
                ? JSON.parse(resendSettings.json_config_data || "{}") || {}
                : {};

            if (isDemo()) {
                if (config.api_key) config.api_key = maskApiKey(config.api_key);
                if (config.from_email)
                    config.from_email = maskApiKey(config.from_email, 0);
                if (config.to_email)
                    config.to_email = maskApiKey(config.to_email, 0);
            }

            return config;
        } catch (error) {
            console.error(
                "❌ Failed to get Resend webhook configuration:",
                error
            );
            return {};
        }
    },

    /**
     * Sets Resend notification enabled status
     * @async
     * @memberof resend
     * @param {boolean} isEnabled - Whether notifications should be enabled
     * @returns {Promise<Object>} Operation result
     *
     * @example
     * const result = await resend.saveNotificationStatus(true);
     * // Returns: { status: 200, message: "Resend notifications enabled" }
     */
    async saveNotificationStatus(isEnabled) {
        try {
            const demoAccessError = validateDemoAccess();
            if (demoAccessError) return demoAccessError;

            const enabledValue = isEnabled ? 1 : 0;

            const updateResult = await executeSql(
                SETTINGS_QUERIES.UPDATE_RESEND_ENABLED_ONLY,
                [enabledValue]
            );

            if (updateResult?.meta?.changes > 0) {
                const statusMessage = isEnabled
                    ? "Resend notifications locked and loaded! 🚀"
                    : "Resend notifications taking a nap 😴";
                return { status: 200, message: statusMessage };
            }

            const defaultResendConfiguration = createResendConfiguration();
            await executeSql(SETTINGS_QUERIES.UPSERT_RESEND_SETTINGS, [
                JSON.stringify(defaultResendConfiguration),
                enabledValue,
            ]);

            return {
                status: 201,
                message: `Resend notifications enabled! 🎉 (Psst - don't forget to set your credential in Settings)`,
            };
        } catch (error) {
            console.error(
                "❌ Failed to set Resend notification status:",
                error
            );
            return {
                status: 500,
                message: `Failed to set Resend status: ${error.message}`,
            };
        }
    },

    /**
     * Saves and tests Resend email configuration
     * @async
     * @memberof resend
     * @param {string} apiKey - Resend API key
     * @param {string} fromEmail - From email address
     * @param {string} toEmail - To email address
     * @param {string} notificationTime - Notification time in HH:MM format
     * @param {Object} [options={}] - Configuration options
     * @param {boolean} [options.shouldTestConnection=true] - Whether to test the email connection
     * @returns {Promise<Object>} Operation result
     *
     * @example
     * // Test connection (default behavior)
     * const result = await resend.saveConfig(
     *   "re_AbCdEf123456",
     *   "notifications@yourdomain.com",
     *   "admin@yourdomain.com",
     *   "14:30"
     * );
     *
     * @example
     * // Save without testing
     * const result = await resend.saveConfig(
     *   "re_AbCdEf123456",
     *   "notifications@yourdomain.com",
     *   "admin@yourdomain.com",
     *   "14:30",
     *   { shouldTestConnection: false }
     * );
     *
     * @example
     * // Explicit test (same as default)
     * const result = await resend.saveConfig(
     *   "re_AbCdEf123456",
     *   "notifications@yourdomain.com",
     *   "admin@yourdomain.com",
     *   "14:30",
     *   { shouldTestConnection: true }
     * );
     */
    async saveConfig(
        apiKey,
        fromEmail,
        toEmail,
        notificationTime,
        options = {}
    ) {
        const { shouldTestConnection = true } = options;
        try {
            const demoAccessError = validateDemoAccess();
            if (demoAccessError) return demoAccessError;

            const initialResendConfiguration = createResendConfiguration({
                apiKey,
                fromEmail,
                toEmail,
                notificationTime,
                connectionStatus: RESEND_CONNECTION_STATUS.READY,
            });

            await executeSql(SETTINGS_QUERIES.UPDATE_RESEND_VALUE_ONLY, [
                JSON.stringify(initialResendConfiguration),
            ]);

            if (!shouldTestConnection) {
                return {
                    status: 201,
                    message:
                        "Resend config saved! ⭐ Pro tip: Test it out to make sure everything's smooth",
                };
            }

            // Test email configuration
            const emailTestResult = await testResendEmail(
                apiKey,
                fromEmail,
                toEmail,
                notificationTime
            );
            const isConnectionSuccessful = emailTestResult?.status === 200;

            const finalResendConfiguration = createResendConfiguration({
                apiKey,
                fromEmail,
                toEmail,
                notificationTime,
                connectionStatus: isConnectionSuccessful
                    ? RESEND_CONNECTION_STATUS.CONNECTED
                    : RESEND_CONNECTION_STATUS.DISCONNECTED,
                verifiedAt: new Date().toISOString(),
            });

            await executeSql(SETTINGS_QUERIES.UPDATE_RESEND_VALUE_ONLY, [
                JSON.stringify(finalResendConfiguration),
            ]);

            const responseMessage = isConnectionSuccessful
                ? `Test email sent! Resend is ready to deliver at ${notificationTime} 🚀`
                : `Connection test stumbled: ${emailTestResult.message} 🔧`;

            return {
                status: emailTestResult.status,
                message: responseMessage,
            };
        } catch (error) {
            console.error(
                "❌ Failed to save Resend email configuration:",
                error
            );
            return {
                status: 500,
                message: `Houston, we have a problem: ${error.message}`,
            };
        }
    },
};
