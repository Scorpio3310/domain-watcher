/**
 * @fileoverview Settings management service
 * @module SettingsService
 */

import { executeSql } from "$src/lib/database/db";
import { SETTINGS_QUERIES } from "$src/lib/database/settings-queries";
import { getErrorMessage } from "$src/lib/utils/helpers";
import { UI_DOMAIN_VIEW, DOMAIN_PROVIDER } from "$lib/constants/constants";
import { validateDemoMode } from "$src/lib/server/utils/access";

// ========================================
// CORE UTILITIES
// ========================================

/**
 * Safely parses JSON with fallback
 * @param {string} jsonString - JSON string to parse
 * @param {Object} [fallback={}] - Fallback value when parsing fails
 */
const parseJsonSafely = (jsonString, fallback = {}) => {
    try {
        return JSON.parse(jsonString);
    } catch {
        return fallback;
    }
};

// ========================================
// UI SETTINGS MANAGEMENT
// ========================================

/**
 * UI settings management operations
 * @namespace ui
 */
export const ui = {
    /**
     * Gets current UI view mode
     * @async
     * @memberof ui
     * @returns {Promise<string>} UI view mode (falls back to compact view on errors)
     *
     * @example
     * const viewMode = await ui.getViewMode();
     * // Returns: "compact" or "detailed"
     */
    async getViewMode() {
        try {
            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_UI_SETTINGS
            );
            const uiSettings = queryResult?.results?.[0];

            if (!uiSettings?.json_config_data) return UI_DOMAIN_VIEW.COMPACT;

            const parsedSettings = parseJsonSafely(uiSettings.json_config_data);
            return parsedSettings.ui_view ?? UI_DOMAIN_VIEW.COMPACT;
        } catch (error) {
            console.error("❌ Failed to get UI view mode:", error);
            return UI_DOMAIN_VIEW.COMPACT;
        }
    },

    /**
     * Sets UI view mode
     * @async
     * @memberof ui
     * @param {string} viewMode - View mode (UI_DOMAIN_VIEW.COMPACT or UI_DOMAIN_VIEW.DETAILED)
     * @param {Object} [additionalSettings={}] - Additional UI settings
     * @returns {Promise<Object>} Operation result
     *
     * @example
     * const result = await ui.saveViewMode(UI_DOMAIN_VIEW.DETAILED);
     * // Returns: { status: 201, message: "Successfully switched to Detailed view" }
     */
    async saveViewMode(viewMode, additionalSettings = {}) {
        try {
            const demoAccessError = validateDemoMode();
            if (demoAccessError) return demoAccessError;

            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_UI_SETTINGS
            );
            const existingSettings = queryResult?.results?.[0];
            const currentUiSettings = existingSettings?.json_config_data
                ? parseJsonSafely(existingSettings.json_config_data)
                : {};

            const updatedUiSettings = {
                ...currentUiSettings,
                ui_view: viewMode,
                ...additionalSettings,
            };

            await executeSql(SETTINGS_QUERIES.UPSERT_UI_SETTINGS, [
                JSON.stringify(updatedUiSettings),
            ]);

            const viewModeLabel =
                viewMode === UI_DOMAIN_VIEW.COMPACT ? "Compact" : "Detailed";
            return {
                status: 201,
                message: `Boom! "${viewModeLabel} View" activated - enjoy the new perspective 👀`,
            };
        } catch (error) {
            console.error("❌ Failed to save UI view mode:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    },
};

// ========================================
// DOMAIN LOOKUP PROVIDER MANAGEMENT
// ========================================

/**
 * Domain lookup provider settings operations
 * @namespace domainProvider
 */
export const domainProvider = {
    /**
     * Gets the stored domain lookup provider configuration
     * @async
     * @memberof domainProvider
     * @returns {Promise<{provider: ('rdap'|'whoisjson')|null, whoisjsonFallback: boolean}>}
     *   Stored provider (null when unset/invalid) and whether RDAP-unsupported
     *   TLDs may fall back to WhoisJSON (absent on legacy rows = true)
     *
     * @example
     * const { provider, whoisjsonFallback } = await domainProvider.getConfig();
     * // Returns: { provider: "rdap", whoisjsonFallback: true }
     */
    async getConfig() {
        try {
            const queryResult = await executeSql(
                SETTINGS_QUERIES.SELECT_DOMAIN_PROVIDER
            );
            const row = queryResult?.results?.[0];
            const parsedConfig = row?.json_config_data
                ? parseJsonSafely(row.json_config_data)
                : {};

            const provider =
                parsedConfig.provider === DOMAIN_PROVIDER.RDAP ||
                parsedConfig.provider === DOMAIN_PROVIDER.WHOIS_JSON
                    ? parsedConfig.provider
                    : null;
            return {
                provider,
                whoisjsonFallback: parsedConfig.whoisjson_fallback !== false,
            };
        } catch (error) {
            console.error("❌ Failed to get domain provider config:", error);
            return { provider: null, whoisjsonFallback: true };
        }
    },

    /**
     * Saves the domain lookup provider selection
     * @async
     * @memberof domainProvider
     * @param {string} provider - Provider to use (DOMAIN_PROVIDER.RDAP or DOMAIN_PROVIDER.WHOIS_JSON)
     * @param {boolean} [whoisjsonFallback=true] - Allow WhoisJSON fallback for TLDs without RDAP
     * @returns {Promise<Object>} Operation result
     *
     * @example
     * const result = await domainProvider.save(DOMAIN_PROVIDER.RDAP, true);
     * // Returns: { status: 201, message: '"RDAP" is now your domain lookup provider 🛰️' }
     */
    async save(provider, whoisjsonFallback = true) {
        try {
            const demoAccessError = validateDemoMode();
            if (demoAccessError) return demoAccessError;

            await executeSql(SETTINGS_QUERIES.UPSERT_DOMAIN_PROVIDER, [
                JSON.stringify({
                    provider,
                    whoisjson_fallback: whoisjsonFallback,
                    version: 2,
                }),
            ]);

            const providerLabel =
                provider === DOMAIN_PROVIDER.RDAP ? "RDAP" : "WhoisJSON";
            const fallbackNote =
                provider === DOMAIN_PROVIDER.RDAP
                    ? ` (WhoisJSON fallback ${whoisjsonFallback ? "on" : "off"})`
                    : "";
            return {
                status: 201,
                message: `"${providerLabel}" is now your domain lookup provider${fallbackNote} 🛰️`,
            };
        } catch (error) {
            console.error("❌ Failed to save domain provider:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    },
};
