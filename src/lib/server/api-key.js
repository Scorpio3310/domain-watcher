/**
 * @fileoverview API key management service for validation and configuration
 * @module ApiKeyService
 */

import { executeQueryFirst, executeSql } from "$src/lib/database/db";
import { SETTINGS_QUERIES } from "$src/lib/database/settings-queries";
import { WHOIS_JSON_API_STATUS } from "$lib/constants/constants";
import { isDemo } from "$src/lib/utils/helpers";
import { maskApiKey } from "$lib/utils/helpers";
import { testApiKeyConnection } from "./whois";

// ========================================
// TYPES & INTERFACES
// ========================================
/**
 * @typedef {Object} ApiKeyConfig
 * @property {string|null} api_key - The API key
 * @property {string} connection_status - Connection status
 * @property {string|null} connection_verified_at - When connection was last verified
 * @property {number} version - Configuration version
 */

/**
 * @typedef {Object} ServiceResult
 * @property {number} status - HTTP status code
 * @property {string} message - Result message
 * @property {*} [data] - Optional data payload
 */

// ========================================
// CORE UTILITIES
// ========================================
/**
 * Validates demo mode for write operations
 * @returns {ServiceResult|null} Error result if demo mode, null if allowed
 */
const validateDemoAccess = () =>
    isDemo()
        ? { status: 403, message: "Demo mode: Look but don't touch 👀" }
        : null;

/**
 * Retrieves API settings from database with error handling
 * @async
 * @returns {Promise<ApiKeyConfig|null>} API configuration object or null
 */
const getApiSettings = async () => {
    try {
        const result = await executeQueryFirst(
            SETTINGS_QUERIES.SELECT_API_SETTINGS
        );
        return result?.json_config_data
            ? JSON.parse(result.json_config_data)
            : null;
    } catch (error) {
        console.error("❌ Failed to get API settings:", error);
        return null;
    }
};

/**
 * Saves configuration to database
 * @param {ApiKeyConfig} config - Configuration to save
 * @returns {Promise<void>}
 */
const saveApiConfiguration = async (config) => {
    try {
        await executeSql(SETTINGS_QUERIES.UPSERT_API_SETTINGS, [
            JSON.stringify(config),
        ]);
    } catch (error) {
        console.error("❌ Failed to save API configuration:", error);
        throw new Error(`Database save failed: ${error.message}`);
    }
};

// ========================================
// API KEY MANAGEMENT
// ========================================

/**
 * API key management operations with consistent error handling and validation
 * @namespace apiKey
 */
export const apiKey = {
    /**
     * Check if API key is configured and valid
     * @async
     * @returns {Promise<boolean>} True if API key exists and is valid
     */
    async isConfigured() {
        try {
            const config = await getApiSettings();
            return !!(config?.api_key && config.api_key.trim().length > 0);
        } catch (error) {
            console.error("❌ Error checking API key configuration:", error);
            return false;
        }
    },

    /**
     * Get API key with consistent masking logic
     * @async
     * @param {Object} [options={}] - Get options
     * @param {boolean} [options.masked=false] - Whether to mask the API key
     * @param {number} [options.visibleChars=6] - Number of visible characters when masking
     * @returns {Promise<string|null>} API key string or null if not found
     */
    async get(options = {}) {
        const { masked = false, visibleChars = 6 } = options;

        try {
            const config = await getApiSettings();
            const rawApiKey = config?.api_key || null;

            if (!rawApiKey) return null;

            // Apply masking logic consistently
            if (masked || isDemo()) {
                return maskApiKey(rawApiKey, visibleChars);
            }

            return rawApiKey;
        } catch (error) {
            console.error("❌ Error getting API key:", error);
            return null;
        }
    },

    /**
     * Get full API configuration with proper error handling
     * @async
     * @returns {Promise<ApiKeyConfig>} Complete API configuration
     */
    async getConfig() {
        try {
            const config = await getApiSettings();

            const defaultConfig = {
                api_key: null,
                connection_status: WHOIS_JSON_API_STATUS.NOT_CONFIGURED,
                connection_verified_at: null,
                version: 1,
            };

            if (!config) {
                return defaultConfig;
            }

            // Apply demo mode masking consistently
            if (isDemo() && config.api_key) {
                return {
                    ...config,
                    api_key: maskApiKey(config.api_key),
                };
            }

            return config;
        } catch (error) {
            console.error("❌ Error getting API configuration:", error);
            return {
                api_key: null,
                connection_status: WHOIS_JSON_API_STATUS.ERROR,
                connection_verified_at: null,
                version: 1,
            };
        }
    },

    /**
     * Validates and saves API key with comprehensive testing
     * @async
     * @param {string} key - API key to validate and save
     * @param {Object} [options={}] - Configuration options
     * @param {number} [options.version=1] - Configuration version
     * @returns {Promise<ServiceResult>} Operation result with consistent format
     */
    async save(key, { version = 1 } = {}) {
        try {
            // Check demo mode first
            const demoError = validateDemoAccess();
            if (demoError) return demoError;

            // Basic input validation
            if (!key || typeof key !== "string" || key.trim().length === 0) {
                return {
                    status: 400,
                    message:
                        "API key can't be empty - drop that secret sauce in here! 🔑",
                };
            }

            const cleanApiKey = key.trim();

            // Test API key BEFORE saving
            console.log("Testing API key before saving...");
            const testResult = await testApiKeyConnection(cleanApiKey);

            // Prepare configuration
            const apiConfiguration = {
                api_key: cleanApiKey,
                version,
                connection_verified_at: new Date().toISOString(),
                connection_status:
                    testResult.status === 200
                        ? WHOIS_JSON_API_STATUS.VALID
                        : WHOIS_JSON_API_STATUS.INVALID,
            };

            // Save to database (even if test failed, for debugging)
            await saveApiConfiguration(apiConfiguration);

            // Return test result
            if (testResult.status !== 200) {
                return {
                    status: testResult.status,
                    message: testResult.message,
                };
            }

            return {
                status: 201,
                message: "API key confirmed! You're all set! 🚀",
            };
        } catch (error) {
            console.error("❌ Failed to save API key:", error);
            return {
                status: 500,
                message: `Failed to save API key: ${error.message}`,
            };
        }
    },
};
