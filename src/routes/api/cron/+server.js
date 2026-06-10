import { CRON_SECRET } from "$env/static/private";
import { json } from "@sveltejs/kit";
import { cronNotifications } from "$lib/server/notifications/cron-notifications.js";
import { getErrorMessage } from "$src/lib/utils/helpers";
import { validateDemoMode } from "$src/lib/server/utils/access";

/**
 * Validates cron request authentication using secret header
 *
 * Checks for the presence and validity of the x-cron-secret header against
 * the configured CRON_SECRET environment variable to ensure only authorized
 * cron services can trigger the endpoint.
 *
 * @param {Request} request - The incoming HTTP request object
 * @returns {{success: boolean, reason?: string}} Authentication result
 *
 * @example
 * const authResult = authenticateRequest(request);
 * if (!authResult.success) {
 *   return json({ error: authResult.reason }, { status: 401 });
 * }
 */
function authenticateRequest(request) {
    const authHeader = request.headers.get("x-cron-secret");

    if (!authHeader || authHeader !== CRON_SECRET) {
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
 * Requires the `x-cron-secret` request header for authentication. Accepts an
 * optional JSON body `{ manual?: boolean }` to force execution bypassing time
 * checking. Responds with JSON execution details (success, executionTime,
 * manual, and notification results from cronNotifications.checkAndSend).
 *
 * @returns {Promise<Response>} JSON response with execution results
 *
 * @description
 * **Regular Operation:**
 * - Call every minute from cron service
 * - Verification only happens at user's scheduled notification times
 * - Prevents unnecessary API calls and respects rate limits
 *
 * **Manual Trigger:**
 * - Bypasses time checking when manual=true in request body
 * - Forces immediate domain verification and notification check
 * - Useful for testing and immediate execution
 *
 * @example
 * // Regular cron execution
 * fetch('/api/cron', {
 *   method: 'POST',
 *   headers: { 'x-cron-secret': 'your-secret' }
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
 * - Headers: x-cron-secret: {{cronSecret}}
 *
 * **Manual Trigger:**
 * - Method: POST
 * - URL: {{baseUrl}}/api/cron
 * - Headers: x-cron-secret: {{cronSecret}}, Content-Type: application/json
 * - Body (raw JSON): {"manual": true}
 *
 * @throws {401} Unauthorized - Invalid or missing x-cron-secret header
 * @throws {500} Internal Server Error - Cron execution failure
 */
/** @type {import('./$types').RequestHandler} */
export async function POST({ request }) {
    const startTime = Date.now();

    try {
        // Validate demo mode
        const demoError = validateDemoMode();
        if (demoError) {
            console.warn("❌ Demo mode detected - cron execution blocked");
            return json(
                { error: "Unauthorized", message: demoError?.message },
                { status: demoError?.status }
            );
        }

        // Authentication check
        const authResult = authenticateRequest(request);
        if (!authResult.success) {
            console.warn("❌ Unauthorized cron request:", authResult.reason);
            return json(
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

        return json({
            success: true,
            executionTime: `${executionTime}ms`,
            manual: isManual,
            ...result,
        });
    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error("❌ Cron job failed:", error);

        return json(
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
    return json({
        status: "healthy",
        service: "Domain Watcher Cron",
        timestamp: new Date().toISOString(),
    });
}
