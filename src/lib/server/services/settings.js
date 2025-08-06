/**
 * @fileoverview Settings management service
 * @module SettingsService
 */

import { executeSql } from "$src/lib/database/db";
import { SETTINGS_QUERIES } from "$src/lib/database/settings-queries";
import { isDemo } from "$src/lib/utils/helpers";
import { UI_DOMAIN_VIEW } from "$lib/constants/constants";

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
 * Safely parses JSON with fallback
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
     * @returns {Promise<string|Object>} UI view mode or error object
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
            return {
                status: 500,
                message: `Houston, we have a problem: ${error.message}`,
            };
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
            const demoAccessError = validateDemoAccess();
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
                message: `Houston, we have a problem: ${error.message}`,
            };
        }
    },
};
