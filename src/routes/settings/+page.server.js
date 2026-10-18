/**
 * @fileoverview Settings page server load and actions
 */

/** @import { ServiceResult, SlackConfig, DiscordConfig, ResendConfig } from '#lib/types.js' */

import { error } from "@sveltejs/kit";
import { getErrorMessage, getHttpStatus } from "#lib/utils/helpers.js";
import { apiKey } from "#lib/server/infrastructure/api-key.js";
import { ui } from "#lib/server/services/settings.js";
import { resolveLookupContext } from "#lib/server/services/domain-lookup.js";
import { slack } from "#lib/server/infrastructure/slack-client.js";
import { discord } from "#lib/server/infrastructure/discord-client.js";
import { resend } from "#lib/server/infrastructure/resend-client.js";

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
        throw error(getHttpStatus(err), getErrorMessage(err));
    }
}
