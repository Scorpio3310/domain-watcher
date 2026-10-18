// Notification provider rows keep the cron's schedule state in
// json_config_data.last_sent_on (local date "YYYY-MM-DD" of the last claimed
// daily report slot, see getScheduleDecision). Saving a provider's settings
// replaces its config but carries that state over (re-reading it inside the
// UPDATE, so a concurrent cron claim can't be lost). Only when the saved
// notification_time differs from the stored one is the state overwritten
// with ?2 (yesterday's date when the new time is still ahead today, see
// getScheduleResetDate; NULL keeps the state). A row without any state yet is
// seeded with ?3 (today when the time already passed, see getScheduleSeedDate)
// so a first save doesn't trigger an immediate report.
/** json_config_data, or NULL when it isn't valid JSON (json_extract → NULL) */
const STORED_CONFIG = `CASE WHEN json_valid(json_config_data) THEN json_config_data END`;

/**
 * UPDATE replacing a notification provider's config (?1) while keeping its
 * schedule state (or resetting it to ?2, see above)
 * @param {string} providerKey - settings.key of the provider row
 * @returns {string} SQL statement
 */
const updateNotificationConfig = (providerKey) => `
        UPDATE settings
        SET json_config_data = CASE
                WHEN ?2 IS NOT NULL
                     AND json_extract(${STORED_CONFIG}, '$.notification_time')
                         IS NOT json_extract(?1, '$.notification_time')
                    THEN json_set(?1, '$.last_sent_on', ?2)
                WHEN json_extract(${STORED_CONFIG}, '$.last_sent_on') IS NOT NULL
                    THEN json_set(?1, '$.last_sent_on', json_extract(json_config_data, '$.last_sent_on'))
                WHEN ?3 IS NOT NULL
                    THEN json_set(?1, '$.last_sent_on', ?3)
                ELSE ?1
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE category = 'notifications' AND key = '${providerKey}'
    `;

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
    // API SETTINGS (Domain Lookup Provider)
    // =============================================================================

    /**
     * Retrieves the selected domain lookup provider configuration
     * @type {string}
     * @description Returns JSON config with the provider choice (rdap/whoisjson)
     * @returns {Array<Object>} Single object: [{json_config_data: "..."}] or empty array
     */
    SELECT_DOMAIN_PROVIDER: `
        SELECT json_config_data FROM settings
        WHERE category = 'api' AND key = 'domain_provider'
    `,

    /**
     * Creates or updates the domain lookup provider selection
     * @type {string}
     * @description UPSERT operation for the provider choice
     * @param {string} json_config_data - JSON string with provider config ({provider, version})
     * @returns {Object} Insert/update result with meta information
     */
    UPSERT_DOMAIN_PROVIDER: `
        INSERT INTO settings (category, key, json_config_data, enabled, description)
        VALUES ('api', 'domain_provider', ?, 1, 'Domain Lookup Provider')
        ON CONFLICT(category, key) DO UPDATE SET
            json_config_data = excluded.json_config_data,
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
     * Updates only Slack configuration data (preserves enabled status and the
     * cron's schedule state)
     * @type {string}
     * @description Replaces webhook and settings without changing enabled/disabled state; keeps last_sent_on unless notification_time changed and ?2 is set
     * @param {string} json_config_data - ?1: JSON string with Slack config (webhook_url, notification_time, etc.)
     * @param {string|null} schedule_reset_date - ?2: last_sent_on to store if notification_time changed (getScheduleResetDate), NULL keeps it
     * @param {string|null} schedule_seed_date - ?3: last_sent_on to store when the row has no schedule state yet (getScheduleSeedDate)
     * @returns {Object} Update result with meta.changes (1 if updated, 0 if not found)
     */
    UPDATE_SLACK_VALUE_ONLY: updateNotificationConfig("slack"),

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
    // DISCORD NOTIFICATION SETTINGS
    // =============================================================================

    /**
     * Retrieves complete Discord notification configuration and status
     * @type {string}
     * @description Returns full settings record with config, enabled status, and metadata
     * @returns {Array<Object>} Single object with all fields: [{id, category, key, json_config_data, enabled, description, created_at, updated_at}] or empty array
     */
    SELECT_DISCORD_SETTINGS: `
        SELECT * FROM settings
        WHERE category = 'notifications' AND key = 'discord'
    `,

    /**
     * Updates only the enabled/disabled status for Discord notifications
     * @type {string}
     * @description Toggles Discord notifications without changing configuration data
     * @param {boolean} enabled - Enable (true) or disable (false) Discord notifications
     * @returns {Object} Update result with meta.changes (1 if updated, 0 if not found)
     */
    UPDATE_DISCORD_ENABLED_ONLY: `
        UPDATE settings
        SET enabled = ?, updated_at = CURRENT_TIMESTAMP
        WHERE category = 'notifications' AND key = 'discord'
    `,

    /**
     * Updates only Discord configuration data (preserves enabled status and
     * the cron's schedule state)
     * @type {string}
     * @description Replaces webhook and settings without changing enabled/disabled state; keeps last_sent_on unless notification_time changed and ?2 is set
     * @param {string} json_config_data - ?1: JSON string with Discord config (webhook_url, notification_time, etc.)
     * @param {string|null} schedule_reset_date - ?2: last_sent_on to store if notification_time changed (getScheduleResetDate), NULL keeps it
     * @param {string|null} schedule_seed_date - ?3: last_sent_on to store when the row has no schedule state yet (getScheduleSeedDate)
     * @returns {Object} Update result with meta.changes (1 if updated, 0 if not found)
     */
    UPDATE_DISCORD_VALUE_ONLY: updateNotificationConfig("discord"),

    /**
     * Creates or completely updates Discord notification settings
     * @type {string}
     * @description UPSERT operation - handles both config and enabled status simultaneously
     * @param {string} json_config_data - JSON string with complete Discord configuration
     * @param {boolean} enabled - Enable/disable status for notifications
     * @returns {Object} Insert/update result with meta information
     */
    UPSERT_DISCORD_SETTINGS: `
        INSERT INTO settings (category, key, json_config_data, enabled, description, created_at, updated_at)
        VALUES ('notifications', 'discord', ?, ?, 'Discord - Notification Settings', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
     * Updates only Resend configuration data (preserves enabled status and
     * the cron's schedule state)
     * @type {string}
     * @description Replaces API key and email settings without changing enabled/disabled state; keeps last_sent_on unless notification_time changed and ?2 is set
     * @param {string} json_config_data - ?1: JSON string with Resend config (api_key, from_email, to_email, notification_time, etc.)
     * @param {string|null} schedule_reset_date - ?2: last_sent_on to store if notification_time changed (getScheduleResetDate), NULL keeps it
     * @param {string|null} schedule_seed_date - ?3: last_sent_on to store when the row has no schedule state yet (getScheduleSeedDate)
     * @returns {Object} Update result with meta.changes (1 if updated, 0 if not found)
     */
    UPDATE_RESEND_VALUE_ONLY: updateNotificationConfig("resend"),

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

    // =============================================================================
    // NOTIFICATION SCHEDULE STATE (cron)
    // =============================================================================

    /**
     * Atomically claims a provider's daily report slot before the cron sends it
     * @type {string}
     * @description Sets last_sent_on to the slot date only while the provider is enabled, still scheduled at the time the decision was made for, and no run has claimed this (or a later) slot yet. A single UPDATE is atomic in D1/SQLite, so of two overlapping cron runs exactly one gets meta.changes = 1.
     * @param {string} provider_key - ?1: settings.key ('slack', 'discord', 'resend')
     * @param {string} slot_date - ?2: local date "YYYY-MM-DD" of the slot (getScheduleDecision().slotDate)
     * @param {string} notification_time - ?3: notification time the decision was based on ("HH:MM")
     * @returns {Object} Update result with meta.changes (1 = claimed by this run, 0 = already claimed or settings changed)
     */
    CLAIM_NOTIFICATION_SLOT: `
        UPDATE settings
        SET json_config_data = json_set(json_config_data, '$.last_sent_on', ?2, '$.last_attempt_on', ?2)
        WHERE category = 'notifications' AND key = ?1
          AND enabled = 1
          AND json_valid(json_config_data)
          AND json_extract(json_config_data, '$.notification_time') = ?3
          AND (json_extract(json_config_data, '$.last_sent_on') IS NULL
               OR json_extract(json_config_data, '$.last_sent_on') < ?2)
    `,

    /**
     * Gives a claimed slot back after the send failed, so the next cron tick retries
     * @type {string}
     * @description Restores the previous last_sent_on (or removes it) only while the row still holds this run's claim
     * @param {string} provider_key - ?1: settings.key ('slack', 'discord', 'resend')
     * @param {string} slot_date - ?2: the claimed slot date
     * @param {string|null} previous_sent_on - ?3: last_sent_on before the claim (NULL removes the key)
     * @returns {Object} Update result with meta.changes (0 when the claim was already replaced)
     */
    RELEASE_NOTIFICATION_SLOT: `
        UPDATE settings
        SET json_config_data = CASE
                WHEN ?3 IS NULL THEN json_remove(json_config_data, '$.last_sent_on')
                ELSE json_set(json_config_data, '$.last_sent_on', ?3)
            END
        WHERE category = 'notifications' AND key = ?1
          AND json_valid(json_config_data)
          AND json_extract(json_config_data, '$.last_sent_on') = ?2
    `,
};
