/**
 * Database queries for domain management and monitoring
 * Handles domain CRUD operations, verification checks, and status updates
 * @namespace DOMAIN_QUERIES
 */
export const DOMAIN_QUERIES = {
    // =============================================================================
    // BASIC DOMAIN OPERATIONS
    // =============================================================================

    /**
     * Retrieves all domains ordered by most recent
     * @type {string}
     * @description Returns complete domain records sorted by ID (newest first)
     * @returns {Array<Object>} Domain objects with all fields including metadata
     */
    SELECT_ALL_DOMAINS: `
        SELECT *
        FROM domains 
        ORDER BY id DESC
    `,

    /**
     * Retrieves a specific domain by its unique ID
     * @type {string}
     * @description Returns single domain record or null if not found
     * @param {number} id - The domain ID to lookup
     * @returns {Object|null} Complete domain record or null
     */
    SELECT_DOMAIN_BY_ID: `
        SELECT * FROM domains WHERE id = ?
    `,

    /**
     * Permanently removes a domain from the database
     * @type {string}
     * @description Hard delete - cannot be undone
     * @param {number} id - Domain ID to delete
     * @returns {Object} Result with meta.changes (1 if deleted, 0 if not found)
     */
    DELETE_DOMAIN: `
        DELETE FROM domains
        WHERE id = ?
    `,

    // =============================================================================
    // DOMAIN INSERTION & EXISTENCE CHECKS
    // =============================================================================

    /**
     * Adds a new domain with default values
     * @type {string}
     * @description Creates new domain record (status: 'Not Checked', check_count: 0)
     * @param {string} domain_name - Domain name to add (e.g., "example.com")
     * @returns {Object} Insert result with meta.last_row_id
     */
    INSERT_DOMAIN: `
        INSERT INTO domains (domain_name) 
        VALUES (?)
    `,

    /**
     * Safely adds domain only if it doesn't exist
     * @type {string}
     * @description Uses INSERT OR IGNORE to prevent duplicates
     * @param {string} domain_name - Domain name to add
     * @returns {Object} Insert result - meta.changes = 0 if already exists, 1 if added
     */
    INSERT_DOMAIN_IF_NOT_EXISTS: `
        INSERT OR IGNORE INTO domains (domain_name) 
        VALUES (?)
    `,

    /**
     * Checks if domain exists in database (case-insensitive)
     * @type {string}
     * @description D1-compatible existence check using COUNT approach
     * @param {string} domain_name - Domain name to verify
     * @returns {Array<Object>} Single object: [{is_found: "true"}] or [{is_found: "false"}]
     * @example
     * const result = await executeQuery(DOMAIN_QUERIES.CHECK_DOMAIN_EXISTS, ["example.com"]);
     * const exists = result[0]?.is_found === "true";
     */
    CHECK_DOMAIN_EXISTS: `
        SELECT 
            CASE 
                WHEN COUNT(*) > 0 THEN 'true' 
                ELSE 'false' 
            END as is_found
        FROM domains 
        WHERE domain_name = ? COLLATE NOCASE
    `,

    // =============================================================================
    // DOMAIN STATUS & DATA UPDATES
    // =============================================================================

    /**
     * Updates domain after WHOIS/availability check
     * @type {string}
     * @description Complete domain status update with check counter increment
     * @param {number} status - Domain status (0=Not Checked, 1=Available, 2=Registered, etc.)
     * @param {string|null} expires - ISO date string or NULL for available domains
     * @param {string|null} raw_domain_data - JSON string with complete WHOIS response
     * @param {number} id - Domain ID to update
     * @returns {Object} Update result with meta.changes
     */
    UPDATE_DOMAIN: `
        UPDATE domains 
        SET status = ?, 
            expires = ?,
            raw_domain_data = ?, 
            check_count = check_count + 1,
            last_domain_checked = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,

    /**
     * Updates DNS/NSLookup data separately from main checks
     * @type {string}
     * @description Stores DNS resolution data without affecting check counters
     * @param {string|null} raw_ns_data - JSON string with DNS lookup response
     * @param {number} id - Domain ID to update
     * @returns {Object} Update result with meta.changes
     */
    UPDATE_DOMAIN_NS: `
        UPDATE domains 
        SET raw_ns_data = ?, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,

    /**
     * Updates SSL certificate information
     * @type {string}
     * @description Stores SSL certificate data without affecting check counters
     * @param {string|null} raw_ssl_data - JSON string with SSL certificate details
     * @param {number} id - Domain ID to update
     * @returns {Object} Update result with meta.changes
     */
    UPDATE_DOMAIN_SSL: `
        UPDATE domains 
        SET raw_ssl_data = ?, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,

    /**
     * Marks domain as error state with message
     * @type {string}
     * @description Sets error status, saves error details, increments check count
     * @param {string} errorMessage - Error description for troubleshooting
     * @param {number} domainId - Domain ID to mark as error
     * @returns {Object} Update result with meta.changes
     */
    UPDATE_DOMAIN_ERROR: `
        UPDATE domains 
        SET status = 'error', 
            error_message = ?,
            check_count = check_count + 1,
            last_domain_checked = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,

    // =============================================================================
    // DOMAIN VERIFICATION & MONITORING QUERIES
    // =============================================================================

    /**
     * Finds domains requiring basic verification checks
     * @type {string}
     * @description Returns domains that need status verification
     * @returns {Array<Object>} Domains with: no expiry, expired, or unchecked status
     */
    SELECT_DOMAINS_NEEDING_CHECK: `
        SELECT *
        FROM domains 
        WHERE expires IS NULL 
           OR expires <= datetime('now')
           OR status = 0
    `,

    /**
     * UNIFIED query for comprehensive domain monitoring (SINGLE DB CALL)
     * @type {string}
     * @description Returns ALL domains needing attention with smart prioritization
     * @returns {Array<Object>} Prioritized domains with verification flags and categories
     * @example
     * // Returns domains with these additional fields:
     * // - verification_priority: 1-6 (1=CRITICAL, 6=LOWEST)
     * // - is_expired_registered: 1/0 (registered but expired)
     * // - needs_verification: 1/0 (available/error/unchecked)
     * // - is_expiring_soon: 1/0 (expires within 30 days)
     */
    SELECT_UNIFIED_DOMAINS_FOR_VERIFICATION: `
        SELECT 
            id,
            domain_name, 
            status, 
            expires,
            last_domain_checked,
            -- Smart prioritization for processing order
            CASE 
                WHEN expires < datetime('now') AND status = 'registered' THEN 1  -- CRITICAL: Expired registered
                WHEN status = 'error' THEN 2                                      -- HIGH: Error retry
                WHEN status = 'not_checked' THEN 3                               -- MEDIUM: Never checked
                WHEN status = 'available' THEN 4                                 -- LOW: Re-check available
                WHEN expires BETWEEN datetime('now') AND datetime('now', '+30 days') AND status = 'registered' THEN 5  -- INFO: Expiring soon
                ELSE 6                                                           -- LOWEST: Others
            END as verification_priority,
            -- Category flags for easy filtering and processing
            CASE WHEN expires < datetime('now') AND status = 'registered' THEN 1 ELSE 0 END as is_expired_registered,
            CASE WHEN status IN ('available', 'error', 'not_checked') THEN 1 ELSE 0 END as needs_verification,
            CASE WHEN expires BETWEEN datetime('now') AND datetime('now', '+30 days') AND status = 'registered' THEN 1 ELSE 0 END as is_expiring_soon
        FROM domains 
        WHERE 
            -- CRITICAL: Expired registered domains
            (expires < datetime('now') AND status = 'registered')
            -- OR needs verification (available/error/unchecked)
            OR status IN ('available', 'error', 'not_checked')
            -- OR expiring within 30 days
            OR (expires BETWEEN datetime('now') AND datetime('now', '+30 days') AND status = 'registered')
        ORDER BY verification_priority ASC, last_domain_checked ASC
    `,
};
