import { EXPIRY_WARNING_DAYS } from "#lib/constants/constants.js";

// =============================================================================
// SHARED VERIFICATION PREDICATES
// =============================================================================
// Interpolated into BOTH selection queries (SELECT_DOMAINS_NEEDING_CHECK and
// SELECT_UNIFIED_DOMAINS_FOR_VERIFICATION) so the manual and cron paths can't
// drift apart. `expires` is always wrapped in datetime(): it is stored as ISO
// "YYYY-MM-DDTHH:MM:SSZ" while datetime('now') yields "YYYY-MM-DD HH:MM:SS",
// and a raw TEXT comparison is off by up to a day ('T' sorts after ' ').
// datetime() returns NULL for an unparseable value, which is treated like
// "no expiry data". last_domain_checked is always written via
// CURRENT_TIMESTAMP, so it already matches datetime('now') formatting.
// Status values must match DOMAIN_STATUS in #lib/constants/constants.js.

/** Daily refresh cadence (< 24h so a fixed daily cron time never just misses it) */
const DAILY_REFRESH_AFTER = "-20 hours";
/** Safety-net refresh cadence for every registered domain */
const SAFETY_NET_REFRESH_AFTER = "-7 days";
/** Scheduled cron runs skip domains checked within this window (see cronNotifications.checkDomains) */
const RECENTLY_CHECKED_WITHIN = "-12 hours";

/** End of the "expiring soon" window (EXPIRY_WARNING_DAYS from now) */
const EXPIRY_WINDOW_END = `datetime('now', '+${EXPIRY_WARNING_DAYS} days')`;

/** Registered, but the stored expiry has already passed */
const IS_EXPIRED_REGISTERED = `(status = 'registered' AND datetime(expires) < datetime('now'))`;

/** available/error/not_checked, or registered without (usable) expiry data (e.g. .de/.ch via RDAP) */
const NEEDS_VERIFICATION = `(status IN ('available', 'error', 'not_checked') OR (status = 'registered' AND datetime(expires) IS NULL))`;

/** Registered and expiring within the warning window (the report's "expiring" section) */
const IS_EXPIRING_SOON = `(status = 'registered' AND datetime(expires) BETWEEN datetime('now') AND ${EXPIRY_WINDOW_END})`;

/**
 * Stored registry status shows a grace/deletion state. Walks every element of
 * raw_domain_data → rawDomainData.status (the envelope verifyDomain stores):
 * RDAP phrases ("redemption period", "pending delete", "auto renew period")
 * and WhoisJSON EPP codes ("redemptionPeriod", "pendingDelete",
 * "autoRenewPeriod", optionally followed by an icann.org URL). Each element
 * is matched on its own after stripping spaces and folding case, so unrelated
 * codes (e.g. "pending transfer" + "client delete prohibited") can't combine
 * into a match. json_valid() guards malformed rows (json_each would throw).
 */
const IN_GRACE_OR_DELETION_STATE = `EXISTS (
            SELECT 1
            FROM json_each(CASE WHEN json_valid(raw_domain_data) THEN raw_domain_data ELSE '{}' END, '$.rawDomainData.status') AS registry_status
            WHERE lower(replace(registry_status.value, ' ', '')) LIKE '%redemptionperiod%'
               OR lower(replace(registry_status.value, ' ', '')) LIKE '%pendingdelete%'
               OR lower(replace(registry_status.value, ' ', '')) LIKE '%autorenewperiod%'
        )`;

/**
 * Daily refresh of a registered domain with a future expiry that is either
 * expiring soon (catches renewals) or in a grace/deletion state (catches a
 * drop after a registry auto-renew moved the expiry a year ahead)
 */
const NEEDS_DAILY_REFRESH = `(status = 'registered'
            AND datetime(expires) >= datetime('now')
            AND (datetime(expires) <= ${EXPIRY_WINDOW_END} OR ${IN_GRACE_OR_DELETION_STATE})
            AND (last_domain_checked IS NULL OR last_domain_checked < datetime('now', '${DAILY_REFRESH_AFTER}')))`;

/** Safety net: any registered domain with a future expiry not checked for a week (early deletions etc.) */
const NEEDS_SAFETY_NET_REFRESH = `(status = 'registered'
            AND datetime(expires) >= datetime('now')
            AND (last_domain_checked IS NULL OR last_domain_checked < datetime('now', '${SAFETY_NET_REFRESH_AFTER}')))`;

/** Registered domain with a future expiry that is due for a refresh check */
const NEEDS_REFRESH = `(${NEEDS_DAILY_REFRESH} OR ${NEEDS_SAFETY_NET_REFRESH})`;

/** Checked recently enough that a scheduled run reuses the stored state */
const IS_RECENTLY_CHECKED = `(last_domain_checked >= datetime('now', '${RECENTLY_CHECKED_WITHIN}'))`;

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
     * Retrieves the home page domain list ordered by most recent
     * @type {string}
     * @description Returns only the columns a domain card shows up front,
     * sorted by ID (newest first). The raw RDAP/WhoisJSON/NS/SSL JSON never
     * leaves the database here (an expanded card loads it on demand via
     * SELECT_DOMAIN_DETAILS_BY_ID); registrar and lookup source are derived
     * from the stored lookup envelope (raw_domain_data) in SQL instead.
     * json_valid() guards malformed rows (json_extract would throw).
     * @returns {Array<Object>} Domain list rows: id, domain_name, status,
     *   expires, error_message, last_domain_checked, created_at,
     *   registrar (registrar name or NULL), source ("RDAP" / "WhoisJSON" /
     *   NULL for legacy rows)
     */
    SELECT_ALL_DOMAINS: `
        SELECT
            id,
            domain_name,
            status,
            expires,
            error_message,
            last_domain_checked,
            created_at,
            CASE WHEN json_valid(raw_domain_data)
                THEN NULLIF(json_extract(raw_domain_data, '$.registrar.name'), '')
            END AS registrar,
            CASE WHEN json_valid(raw_domain_data)
                THEN CASE json_extract(raw_domain_data, '$.source')
                    WHEN 'rdap' THEN 'RDAP'
                    WHEN 'whoisjson' THEN 'WhoisJSON'
                END
            END AS source
        FROM domains
        ORDER BY id DESC
    `,

    /**
     * Retrieves the raw lookup data of a single domain
     * @type {string}
     * @description The JSON an expanded domain card shows (lookup envelope,
     * NS and SSL responses), loaded on demand instead of with the list
     * @param {number} id - The domain ID to lookup
     * @returns {Object|null} {raw_domain_data, raw_ns_data, raw_ssl_data} or null
     */
    SELECT_DOMAIN_DETAILS_BY_ID: `
        SELECT raw_domain_data, raw_ns_data, raw_ssl_data
        FROM domains
        WHERE id = ?
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
     * @description Complete domain status update with check counter increment.
     * Clears error_message — a definitive answer supersedes any earlier failure.
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
            error_message = NULL,
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

    /**
     * Records a failed check WITHOUT destroying the last known definitive status
     * @type {string}
     * @description Used when a domain with a known status (available/registered)
     * hits a transient failure (provider outage, rate limit, DB hiccup): the
     * status/expires/raw_domain_data stay untouched so reports keep reflecting
     * the last definitive answer, while the failure itself stays visible in
     * error_message. Same parameter shape as UPDATE_DOMAIN_ERROR.
     * @param {string} errorMessage - Error description for troubleshooting
     * @param {number} domainId - Domain ID that failed the check
     * @returns {Object} Update result with meta.changes
     */
    UPDATE_DOMAIN_CHECK_FAILED: `
        UPDATE domains
        SET error_message = ?,
            check_count = check_count + 1,
            last_domain_checked = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `,

    // =============================================================================
    // DOMAIN VERIFICATION & MONITORING QUERIES
    // =============================================================================

    /**
     * Finds domains requiring a check (manual "Check Domains" button)
     * @type {string}
     * @description Returns domains that need status verification: no (usable)
     * expiry, expired, a non-registered status, or a registered domain due for
     * a refresh — daily when expiring soon or in a grace/deletion state, weekly
     * otherwise. Built from the same shared predicates as
     * SELECT_UNIFIED_DOMAINS_FOR_VERIFICATION below, so both paths agree.
     * Sort order (the caller slices to CONFIG.LIMIT_DOMAIN_CHECKS): expired /
     * non-registered first, then registered without expiry data (.de/.ch via
     * RDAP), then daily refreshes, then weekly safety-net refreshes — each
     * oldest-checked first, so the remainder rotates fairly across runs.
     * @returns {Array<Object>} Domains needing a check, in processing order
     */
    SELECT_DOMAINS_NEEDING_CHECK: `
        SELECT *
        FROM domains
        WHERE datetime(expires) IS NULL
           OR datetime(expires) <= datetime('now')
           OR status IN ('not_checked', 'available', 'error')
           OR ${NEEDS_REFRESH}
        ORDER BY CASE
                     WHEN status = 'registered' AND datetime(expires) IS NULL THEN 1
                     WHEN ${NEEDS_DAILY_REFRESH} THEN 2
                     WHEN ${NEEDS_SAFETY_NET_REFRESH} THEN 3
                     ELSE 0
                 END ASC,
                 last_domain_checked ASC
    `,

    /**
     * UNIFIED query for comprehensive domain monitoring (SINGLE DB CALL)
     * @type {string}
     * @description Single source of truth for the cron path: returns every
     * domain the cron must verify or report, with SQL-computed category flags
     * (domainVerification.getAllDomainsForVerification partitions by them —
     * no JS date re-derivation). Uses the same shared predicates as
     * SELECT_DOMAINS_NEEDING_CHECK above; the warning window comes from
     * EXPIRY_WARNING_DAYS in #lib/constants/constants.js.
     * @returns {Array<Object>} Prioritized domains with verification flags and categories
     * @example
     * // Returns domains with these additional fields:
     * // - verification_priority: 1-8 processing order
     * //     1 expired registered, 2 error, 3 not_checked, 4 available,
     * //     5 registered without expiry data, 6 daily refresh (expiring soon /
     * //     grace-deletion state), 7 weekly safety-net refresh,
     * //     8 report-only (expiring soon, refreshed recently)
     * // - is_expired_registered: 1/0 (registered but expired) → verify + report
     * // - needs_verification: 1/0 (available/error/unchecked/registered-no-expiry) → verify
     * // - is_expiring_soon: 1/0 (expires within EXPIRY_WARNING_DAYS) → report
     * // - needs_refresh: 1/0 (registered, future expiry, refresh due) → verify only
     * // - is_recently_checked: 1/0 (checked within 12h) → scheduled runs skip it
     */
    SELECT_UNIFIED_DOMAINS_FOR_VERIFICATION: `
        SELECT
            id,
            domain_name,
            status,
            expires,
            last_domain_checked,
            -- Processing order (cron verifies in this order, capped per run)
            CASE
                WHEN ${IS_EXPIRED_REGISTERED} THEN 1
                WHEN status = 'error' THEN 2
                WHEN status = 'not_checked' THEN 3
                WHEN status = 'available' THEN 4
                WHEN status = 'registered' AND datetime(expires) IS NULL THEN 5
                WHEN ${NEEDS_DAILY_REFRESH} THEN 6
                WHEN ${NEEDS_SAFETY_NET_REFRESH} THEN 7
                ELSE 8
            END as verification_priority,
            -- Category flags (the single source of truth for categorization)
            CASE WHEN ${IS_EXPIRED_REGISTERED} THEN 1 ELSE 0 END as is_expired_registered,
            CASE WHEN ${NEEDS_VERIFICATION} THEN 1 ELSE 0 END as needs_verification,
            CASE WHEN ${IS_EXPIRING_SOON} THEN 1 ELSE 0 END as is_expiring_soon,
            CASE WHEN ${NEEDS_REFRESH} THEN 1 ELSE 0 END as needs_refresh,
            CASE WHEN ${IS_RECENTLY_CHECKED} THEN 1 ELSE 0 END as is_recently_checked
        FROM domains
        WHERE ${IS_EXPIRED_REGISTERED}
           OR ${NEEDS_VERIFICATION}
           OR ${IS_EXPIRING_SOON}
           OR ${NEEDS_REFRESH}
        ORDER BY verification_priority ASC, last_domain_checked ASC
    `,
};
