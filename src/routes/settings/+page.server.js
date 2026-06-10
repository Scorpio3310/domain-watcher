/**
 * @fileoverview Settings page server load and actions
 */

/** @import { ServiceResult, SlackConfig, ResendConfig } from '$lib/types' */

import { error } from "@sveltejs/kit";
import { getErrorMessage, getHttpStatus } from "$src/lib/utils/helpers";
import { apiKey } from "$src/lib/server/infrastructure/api-key";
import { ui } from "$src/lib/server/services/settings";
import { slack } from "$src/lib/server/infrastructure/slack-client";
import { resend } from "$src/lib/server/infrastructure/resend-client";

// ========================================
// PAGE LOAD
// ========================================

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    try {
        // Fetch all settings data in parallel
        const [
            apiKeyConfig,
            rawViewMode,
            isSlackNotificationEnabled,
            rawSlackWebhookConfig,
            isResendNotificationEnabled,
            rawResendConfig,
        ] = await Promise.all([
            apiKey.getConfig(),
            ui.getViewMode(),
            slack.getNotificationStatus(),
            slack.getWebhookConfig(),
            resend.getNotificationStatus(),
            resend.getResendConfig(),
        ]);

        const currentViewMode = /** @type {string} */ (rawViewMode);
        const slackWebhookConfig = /** @type {SlackConfig | null} */ (
            rawSlackWebhookConfig
        );
        const resendConfig = /** @type {ResendConfig | null} */ (
            rawResendConfig
        );

        return {
            viewMode: currentViewMode,
            apiKeyConfig,
            slackWebhookConfig,
            resendConfig,
            slackEnabled: isSlackNotificationEnabled,
            resendEnabled: isResendNotificationEnabled,
        };
    } catch (err) {
        console.error("❌ Settings page load failed:", err);
        throw error(getHttpStatus(err), {
            message: getErrorMessage(err),
        });
    }
}
