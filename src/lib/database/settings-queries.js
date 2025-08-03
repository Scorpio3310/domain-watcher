/**
 * Database queries for application settings management
 * Handles UI preferences, API configurations, and notification settings
 * @namespace SETTINGS_QUERIES
 */
export const SETTINGS_QUERIES = {
    // =============================================================================
    // UI SETTINGS
    // =============================================================================

    /**
     * Retrieves UI configuration data
     * @type {string}
     * @description Returns JSON configuration for user interface preferences
     * @returns {Array<Object>} Single object: [{json_config_data: "..."}] or empty array
     */
    SELECT_UI_SETTINGS: `
        SELECT json_config_data FROM settings 
        WHERE category = 'ui'
    `,

    /**
     * Creates or updates UI settings with automatic conflict resolution
     * @type {string}
     * @description UPSERT operation - creates new or updates existing UI preferences
     * @param {string} json_config_data - JSON string with UI configuration (theme, layout, etc.)
     * @returns {Object} Insert/update result with meta information
     */
    UPSERT_UI_SETTINGS: `
        INSERT INTO settings (category, key, json_config_data, enabled, description)
        VALUES ('ui', 'view_settings', ?, 1, 'User Interface Preferences')
        ON CONFLICT(category, key) DO UPDATE SET 
            json_config_data = excluded.json_config_data,
            enabled = excluded.enabled,
            updated_at = CURRENT_TIMESTAMP
    `,

    // =============================================================================
    // API SETTINGS (WhoisJSON)
    // =============================================================================

    /**
     * Retrieves API configuration for WhoisJSON service
     * @type {string}
     * @description Returns stored API credentials and configuration
     * @returns {Array<Object>} Single object: [{json_config_data: "..."}] or empty array
     */
    SELECT_API_SETTINGS: `
        SELECT json_config_data FROM settings 
        WHERE category = 'api' AND key = 'who_is_json'
    `,

    /**
     * Creates or updates WhoisJSON API configuration
     * @type {string}
     * @description UPSERT operation for API credentials and settings
     * @param {string} json_config_data - JSON string with API config (api_key, endpoints, etc.)
     * @returns {Object} Insert/update result with meta information
     */
    UPSERT_API_SETTINGS: `
        INSERT INTO settings (category, key, json_config_data, enabled, description)
        VALUES ('api', 'who_is_json', ?, 1, 'WhoisJSON API Configuration')
        ON CONFLICT(category, key) DO UPDATE SET 
            json_config_data = excluded.json_config_data,
            enabled = excluded.enabled,
            updated_at = CURRENT_TIMESTAMP
    `,

    // =============================================================================
    // SLACK NOTIFICATION SETTINGS
    // =============================================================================

    /**
     * Retrieves complete Slack notification configuration and status
     * @type {string}
     * @description Returns full settings record with config, enabled status, and metadata
     * @returns {Array<Object>} Single object with all fields: [{id, category, key, json_config_data, enabled, description, created_at, updated_at}] or empty array
     */
    SELECT_SLACK_SETTINGS: `
        SELECT * FROM settings 
        WHERE category = 'notifications' AND key = 'slack'
    `,

    /**
     * Updates only the enabled/disabled status for Slack notifications
     * @type {string}
     * @description Toggles Slack notifications without changing configuration data
     * @param {boolean} enabled - Enable (true) or disable (false) Slack notifications
     * @returns {Object} Update result with meta.changes (1 if updated, 0 if not found)
     */
    UPDATE_SLACK_ENABLED_ONLY: `
        UPDATE settings 
        SET enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = 'notifications' AND key = 'slack'
    `,

    /**
     * Updates only Slack configuration data (preserves enabled status)
     * @type {string}
     * @description Updates webhook and settings without changing enabled/disabled state
     * @param {string} json_config_data - JSON string with Slack config (webhook_url, notification_time, etc.)
     * @returns {Object} Update result with meta.changes (1 if updated, 0 if not found)
     */
    UPDATE_SLACK_VALUE_ONLY: `
        UPDATE settings 
        SET json_config_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = 'notifications' AND key = 'slack'
    `,

    /**
     * Creates or completely updates Slack notification settings
     * @type {string}
     * @description UPSERT operation - handles both config and enabled status simultaneously
     * @param {string} json_config_data - JSON string with complete Slack configuration
     * @param {boolean} enabled - Enable/disable status for notifications
     * @returns {Object} Insert/update result with meta information
     */
    UPSERT_SLACK_SETTINGS: `
        INSERT INTO settings (category, key, json_config_data, enabled, description, created_at, updated_at)
        VALUES ('notifications', 'slack', ?, ?, 'Slack - Notification Settings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(category, key) DO UPDATE SET
            json_config_data = excluded.json_config_data,
            enabled = excluded.enabled,
            updated_at = CURRENT_TIMESTAMP
    `,

    // =============================================================================
    // RESEND EMAIL NOTIFICATION SETTINGS
    // =============================================================================

    /**
     * Retrieves complete Resend email notification configuration and status
     * @type {string}
     * @description Returns full settings record with config, enabled status, and metadata
     * @returns {Array<Object>} Single object with all fields: [{id, category, key, json_config_data, enabled, description, created_at, updated_at}] or empty array
     */
    SELECT_RESEND_SETTINGS: `
        SELECT * FROM settings 
        WHERE category = 'notifications' AND key = 'resend'
    `,

    /**
     * Updates only the enabled/disabled status for Resend email notifications
     * @type {string}
     * @description Toggles email notifications without changing configuration data
     * @param {boolean} enabled - Enable (true) or disable (false) Resend notifications
     * @returns {Object} Update result with meta.changes (1 if updated, 0 if not found)
     */
    UPDATE_RESEND_ENABLED_ONLY: `
        UPDATE settings 
        SET enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = 'notifications' AND key = 'resend'
    `,

    /**
     * Updates only Resend configuration data (preserves enabled status)
     * @type {string}
     * @description Updates API key and email settings without changing enabled/disabled state
     * @param {string} json_config_data - JSON string with Resend config (api_key, from_email, to_email, notification_time, etc.)
     * @returns {Object} Update result with meta.changes (1 if updated, 0 if not found)
     */
    UPDATE_RESEND_VALUE_ONLY: `
        UPDATE settings 
        SET json_config_data = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = 'notifications' AND key = 'resend'
    `,

    /**
     * Creates or completely updates Resend email notification settings
     * @type {string}
     * @description UPSERT operation - handles both config and enabled status simultaneously
     * @param {string} json_config_data - JSON string with complete Resend configuration
     * @param {boolean} enabled - Enable/disable status for email notifications
     * @returns {Object} Insert/update result with meta information
     */
    UPSERT_RESEND_SETTINGS: `
        INSERT INTO settings (category, key, json_config_data, enabled, description, created_at, updated_at)
        VALUES ('notifications', 'resend', ?, ?, 'Resend Email Notification Settings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(category, key) DO UPDATE SET
            json_config_data = excluded.json_config_data,
            enabled = excluded.enabled,
            updated_at = CURRENT_TIMESTAMP
    `,
};
