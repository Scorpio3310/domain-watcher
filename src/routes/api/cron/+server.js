import { CRON_SECRET } from "$app/env/private";
import { cronNotifications } from "#lib/server/notifications/cron-notifications.js";
import { getErrorMessage } from "#lib/utils/helpers.js";
import { validateDemoMode } from "#lib/server/utils/access.js";
import { timingSafeEqual } from "#lib/server/utils/crypto.js";

/**
 * Validates cron request authentication using secret header
 *
 * Checks for the presence and validity of the x-cron-secret header against
 * the configured CRON_SECRET runtime secret (compared in constant time) to
 * ensure only authorized cron services can trigger the endpoint.
 *
 * @param {Request} request - The incoming HTTP request object
 * @param {string} secret - The configured CRON_SECRET
 * @returns {Promise<{success: boolean, reason?: string}>} Authentication result
 *
 * @example
 * const authResult = await authenticateRequest(request, CRON_SECRET);
 * if (!authResult.success) {
 *   return Response.json({ error: authResult.reason }, { status: 401 });
 * }
 */
async function authenticateRequest(request, secret) {
    const authHeader = request.headers.get("x-cron-secret");

    if (!authHeader || !(await timingSafeEqual(authHeader, secret))) {
        return { success: false, reason: "Invalid or missing cron secret!" };
    }

    return { success: true };
}

/**
 * Smart cron endpoint - executes domain verification only when notifications are due
 *
 * This prevents unnecessary WHOIS API calls and respects rate limits by checking
 * notification schedules before running domain verification.
 *
 * @route POST /api/cron
 *
 * Requires the `x-cron-secret` request header (matching the CRON_SECRET
 * runtime secret) for authentication and a
 * `Content-Type: application/json` header (SvelteKit rejects cross-site POST
 * requests without a Content-Type as CSRF with 403). Accepts an
 * optional JSON body `{ manual?: boolean }` to force execution bypassing time
 * checking. Responds with JSON execution details (success, executionTime,
 * manual, and notification results from cronNotifications.checkAndSend).
 *
 * @returns {Promise<Response>} JSON response with execution results
 *
 * @description
 * **Regular Operation:**
 * - Call every minute from cron service
 * - Each provider's daily report goes out once, at its notification time or
 *   up to 60 minutes later (failed sends and missed ticks are retried within
 *   that window; retries reuse the stored domain state)
 * - Verification only happens when a report is due (at most
 *   LIMIT_DOMAIN_CHECKS domains per run), respecting API rate limits
 *
 * **Manual Trigger:**
 * - Bypasses time checking when manual=true in request body
 * - Forces immediate domain verification and notification check
 * - Useful for testing and immediate execution
 *
 * **Demo Mode:**
 * - Responds 200 `{ success: true, action: "skipped", reason }` without doing
 *   any work, so the every-minute cron isn't logged as a failed run
 *
 * @example
 * // Regular cron execution
 * fetch('/api/cron', {
 *   method: 'POST',
 *   headers: {
 *     'x-cron-secret': 'your-secret',
 *     'Content-Type': 'application/json'
 *   }
 * });
 *
 * @example
 * // Manual trigger
 * fetch('/api/cron', {
 *   method: 'POST',
 *   headers: {
 *     'x-cron-secret': 'your-secret',
 *     'Content-Type': 'application/json'
 *   },
 *   body: JSON.stringify({ manual: true })
 * });
 *
 * @postman
 * **Regular Cron:**
 * - Method: POST
 * - URL: {{baseUrl}}/api/cron
 * - Headers: x-cron-secret: {{cronSecret}}, Content-Type: application/json
 *
 * **Manual Trigger:**
 * - Method: POST
 * - URL: {{baseUrl}}/api/cron
 * - Headers: x-cron-secret: {{cronSecret}}, Content-Type: application/json
 * - Body (raw JSON): {"manual": true}
 *
 * @throws {401} Unauthorized - Invalid or missing x-cron-secret header
 * @throws {503} Service Unavailable - CRON_SECRET is not configured, so every
 *   request is rejected (fail closed)
 * @throws {403} Forbidden - Missing Content-Type header (SvelteKit CSRF protection)
 * @throws {500} Internal Server Error - Cron execution failure
 * @throws {502} Bad Gateway - The run executed but no notification was sent
 *   and at least one provider failed (`success: false`, details in
 *   `notifications.errors`), so the scheduled run is marked as failed; failed
 *   sends are retried on the next ticks within 60 minutes of the scheduled time
 * @throws {503} Service Unavailable - Nothing ran (`action: "skipped"`,
 *   `success: false`) because a due report slot couldn't be claimed due to a
 *   database error (details in `claimErrors`) or provider settings couldn't
 *   be loaded (details in `settingsErrors`)
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    const startTime = Date.now();

    try {
        // Demo mode: no work, but a 200 so the every-minute cron trigger
        // isn't recorded as ~1440 failed runs per day
        const demoError = validateDemoMode();
        if (demoError) {
            console.warn("⏭️ Demo mode detected - cron execution skipped");
            return Response.json({
                success: true,
                action: "skipped",
                reason: demoError.message,
            });
        }

        // Fail closed: without a configured secret no request can be authenticated
        if (!CRON_SECRET) {
            console.error(
                '❌ CRON_SECRET is not configured - cron request rejected. Run "npx wrangler secret put CRON_SECRET --env production" (locally: set it in .env)'
            );
            return Response.json(
                {
                    error: "Service Unavailable",
                    message: "Cron secret is not configured",
                },
                { status: 503 }
            );
        }

        // Authentication check
        const authResult = await authenticateRequest(request, CRON_SECRET);
        if (!authResult.success) {
            console.warn("❌ Unauthorized cron request:", authResult.reason);
            return Response.json(
                { error: "Unauthorized", message: authResult.reason },
                { status: 401 }
            );
        }

        // Check for manual trigger in body
        const body = await request.json().catch(() => ({}));
        const isManual = body.manual === true;

        if (isManual) {
            console.log(
                "🔧 Manual trigger detected - forcing notification check"
            );
        }

        // Execute smart cron job (only verifies when needed)
        const result = await cronNotifications.checkAndSend(isManual);

        const executionTime = Date.now() - startTime;
        console.log(`⏱️ Cron job completed in ${executionTime}ms`);

        // Every selected provider failed → non-2xx so cron.js marks the
        // scheduled run as failed instead of "successful" with no report
        const allSendsFailed =
            result.action === "executed" &&
            result.notifications?.sent === 0 &&
            (result.notifications.errors?.length ?? 0) > 0;
        if (allSendsFailed) {
            console.error(
                "❌ Cron run sent no notifications - all providers failed"
            );
        }

        // Nothing ran because a due report couldn't be claimed (DB error) or
        // provider settings couldn't be loaded (so whether a report is due
        // is unknown) → don't report success
        const claimFailed =
            result.action === "skipped" &&
            (result.claimErrors?.length ?? 0) > 0;
        const settingsFailed =
            result.action === "skipped" &&
            (result.settingsErrors?.length ?? 0) > 0;
        if (claimFailed) {
            console.error(
                "❌ Cron run could not claim a due report - database error"
            );
        }
        if (settingsFailed) {
            console.error(
                "❌ Cron run skipped - provider settings could not be loaded"
            );
        }
        const unavailable = claimFailed || settingsFailed;

        return Response.json(
            {
                success: !allSendsFailed && !unavailable,
                executionTime: `${executionTime}ms`,
                manual: isManual,
                ...result,
            },
            { status: allSendsFailed ? 502 : unavailable ? 503 : 200 }
        );
    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error("❌ Cron job failed:", error);

        return Response.json(
            {
                success: false,
                error: getErrorMessage(error),
                executionTime: `${executionTime}ms`,
            },
            { status: 500 }
        );
    }
}

/**
 * Health check endpoint for cron service monitoring
 *
 * @route GET /api/cron
 * @returns {Promise<Response>} Service status and basic info
 */
/** @type {import('./$types').RequestHandler} */
export async function GET() {
    return Response.json({
        status: "healthy",
        service: "Domain Watcher Cron",
        timestamp: new Date().toISOString(),
    });
}
