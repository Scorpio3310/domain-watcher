/**
 * @fileoverview Settings page server load and actions
 */

/** @import { ServiceResult, SlackConfig, DiscordConfig, ResendConfig } from '$lib/types' */

import { error } from "@sveltejs/kit";
import { getErrorMessage, getHttpStatus } from "$src/lib/utils/helpers";
import { apiKey } from "$src/lib/server/infrastructure/api-key";
import { ui } from "$src/lib/server/services/settings";
import { resolveLookupContext } from "$src/lib/server/services/domain-lookup";
import { slack } from "$src/lib/server/infrastructure/slack-client";
import { discord } from "$src/lib/server/infrastructure/discord-client";
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
            lookupContext,
            rawViewMode,
            isSlackNotificationEnabled,
            rawSlackWebhookConfig,
            isDiscordNotificationEnabled,
            rawDiscordWebhookConfig,
            isResendNotificationEnabled,
            rawResendConfig,
        ] = await Promise.all([
            apiKey.getConfig(),
            // Resolved (not raw stored) context: keyed installs without an
            // explicit choice show WhoisJSON, fresh installs show RDAP
            resolveLookupContext(),
            ui.getViewMode(),
            slack.getNotificationStatus(),
            slack.getWebhookConfig(),
            discord.getNotificationStatus(),
            discord.getWebhookConfig(),
            resend.getNotificationStatus(),
            resend.getResendConfig(),
        ]);

        const currentViewMode = /** @type {string} */ (rawViewMode);
        const slackWebhookConfig = /** @type {SlackConfig | null} */ (
            rawSlackWebhookConfig
        );
        const discordWebhookConfig = /** @type {DiscordConfig | null} */ (
            rawDiscordWebhookConfig
        );
        const resendConfig = /** @type {ResendConfig | null} */ (
            rawResendConfig
        );

        return {
            viewMode: currentViewMode,
            domainProvider: lookupContext.provider,
            whoisjsonFallback: lookupContext.whoisjsonFallback,
            apiKeyConfigured: lookupContext.whoisKeyConfigured,
            apiKeyConfig,
            slackWebhookConfig,
            discordWebhookConfig,
            resendConfig,
            slackEnabled: isSlackNotificationEnabled,
            discordEnabled: isDiscordNotificationEnabled,
            resendEnabled: isResendNotificationEnabled,
        };
    } catch (err) {
        console.error("❌ Settings page load failed:", err);
        throw error(getHttpStatus(err), {
            message: getErrorMessage(err),
        });
    }
}
