/**
 * Domain status constants representing different states of domain availability
 * @namespace DOMAIN_STATUS
 * @constant {Object} DOMAIN_STATUS
 * @property {'not_checked'} NOT_CHECKED - Domain has not been checked yet
 * @property {'available'} AVAILABLE - Domain is available for registration
 * @property {'registered'} REGISTERED - Domain is already registered/taken
 * @property {'unknown'} UNKNOWN - Domain status could not be determined
 * @property {'error'} ERROR - An error occurred while checking domain status
 * @readonly
 *
 * @example
 * // Check if domain is available
 * if (domain.status === DOMAIN_STATUS.AVAILABLE) {
 *   console.log("Domain is available for registration");
 * }
 */
export const DOMAIN_STATUS = Object.freeze({
    /** @type {"not_checked"} Domain has not been checked yet */
    NOT_CHECKED: "not_checked",

    /** @type {"available"} Domain is available for registration */
    AVAILABLE: "available",

    /** @type {"registered"} Domain is already registered/taken */
    REGISTERED: "registered",

    /** @type {"error"} An error occurred while checking domain status */
    ERROR: "error",
});

/**
 * UI domain view mode constants
 * @readonly
 * @enum {string}
 * @example
 * // Set UI to compact view
 * await ui.saveViewMode(UI_DOMAIN_VIEW.COMPACT);
 *
 * @example
 * // Check current view mode
 * const viewMode = await ui.getViewMode();
 * if (viewMode === UI_DOMAIN_VIEW.DETAILED) {
 *   console.log("Using detailed view");
 * }
 */
export const UI_DOMAIN_VIEW = Object.freeze({
    /** @type {"compact"} Compact view with minimal information */
    COMPACT: "compact",

    /** @type {"detailed"} Detailed view with extended information */
    DETAILED: "detailed",
});

/**
 * Status constants for feature enablement
 * @readonly
 * @enum {number}
 * @example
 * // Check if feature is enabled
 * const status = await getEnabledStatus();
 * if (status === IS_ENABLED_STATUS.ENABLED) {
 *   console.log("Feature is enabled");
 * }
 *
 * @example
 * // Enable a feature
 * await setFeatureStatus(IS_ENABLED_STATUS.ENABLED);
 */
export const IS_ENABLED_STATUS = Object.freeze({
    /** @type {0} Feature is disabled or not configured */
    DISABLED: 0,

    /** @type {1} Feature is enabled and configured */
    ENABLED: 1,
});

/**
 * Slack webhook connection status constants
 * @readonly
 * @enum {string}
 * @example
 * // Check Slack connection status
 * const status = await getSlackWebhookSettings();
 * if (status.connection_status === SLACK_CONNECTION_STATUS.CONNECTED) {
 *   console.log("Slack webhook is working correctly");
 * }
 *
 * @example
 * // Handle different connection states
 * switch (slackStatus) {
 *   case SLACK_CONNECTION_STATUS.SETUP_REQUIRED:
 *     showSetupForm();
 *     break;
 *   case SLACK_CONNECTION_STATUS.CONNECTED:
 *     enableNotifications();
 *     break;
 * }
 */
export const SLACK_CONNECTION_STATUS = Object.freeze({
    /** @type {"setup_required"} Webhook is not configured */
    SETUP_REQUIRED: "setup_required",

    /** @type {"ready"} Webhook is configured and ready for testing */
    READY: "ready",

    /** @type {"connected"} Webhook connection is working properly */
    CONNECTED: "connected",

    /** @type {"disconnected"} Webhook connection is not working */
    DISCONNECTED: "disconnected",

    /** @type {"error"} System error occurred while checking connection */
    ERROR: "error",
});

/**
 * Resend API connection status constants
 * @readonly
 * @enum {string}
 * @example
 * // Check Resend connection status
 * const status = await getResendSettings();
 * if (status.connection_status === RESEND_CONNECTION_STATUS.CONNECTED) {
 *   console.log("Resend API is working correctly");
 * }
 *
 * @example
 * // Validate Resend configuration
 * const config = await resend.getConfig();
 * if (config.connection_status === RESEND_CONNECTION_STATUS.SETUP_REQUIRED) {
 *   redirectToSetup();
 * }
 */
export const RESEND_CONNECTION_STATUS = Object.freeze({
    /** @type {"setup_required"} API key is not configured */
    SETUP_REQUIRED: "setup_required",

    /** @type {"ready"} API key is configured and ready for testing */
    READY: "ready",

    /** @type {"connected"} API connection is working properly */
    CONNECTED: "connected",

    /** @type {"disconnected"} API connection is not working */
    DISCONNECTED: "disconnected",

    /** @type {"error"} System error occurred while checking connection */
    ERROR: "error",
});

/**
 * WhoisJSON API connection status constants
 * @readonly
 * @enum {string}
 * @example
 * // Check WhoisJSON API status
 * const apiStatus = await getWhoisJsonStatus();
 * if (apiStatus === WHOIS_JSON_API_STATUS.VALID) {
 *   console.log("WhoisJSON API key is working correctly");
 * }
 *
 * @example
 * // Handle API key validation
 * const keyStatus = await apiKey.getConnectionStatus();
 * switch (keyStatus) {
 *   case WHOIS_JSON_API_STATUS.NOT_CONFIGURED:
 *     showApiKeySetup();
 *     break;
 *   case WHOIS_JSON_API_STATUS.INVALID:
 *     showApiKeyError();
 *     break;
 *   case WHOIS_JSON_API_STATUS.VALID:
 *     enableDomainChecks();
 *     break;
 * }
 */
export const WHOIS_JSON_API_STATUS = Object.freeze({
    /** @type {"not_configured"} API key is not configured */
    NOT_CONFIGURED: "not_configured",

    /** @type {"valid"} API key is valid and working properly */
    VALID: "valid",

    /** @type {"invalid"} API key is invalid or expired */
    INVALID: "invalid",

    /** @type {"error"} System error occurred while checking API key */
    ERROR: "error",
});
