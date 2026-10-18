/**
 * @fileoverview Server-side domain management and verification services.
 * Provides domain watchlist management, verification workflows, and
 * comprehensive domain monitoring capabilities for notifications and automation.
 * @module DomainsServer
 */

import { executeSql, executeQueryFirst } from "#lib/database/db.js";
import { DOMAIN_QUERIES } from "#lib/database/domain-queries.js";
import { getErrorMessage } from "#lib/utils/helpers.js";
import {
    validateDemoMode,
    executeDomainQuery,
    verificationEngine,
    CONFIG,
} from "#lib/server/utils/domain-utils.js";
import { DOMAIN_STATUS } from "#lib/constants/constants.js";
import { planVerification } from "#lib/server/services/verification-plan.js";

/** @import { CheckFailure, DomainRecord, VerificationCandidate, BatchOptions, BatchVerificationResult } from "#lib/types.js" */

// ========================================
// DOMAIN WATCHLIST MANAGEMENT
// ========================================

/**
 * Domain watchlist management operations
 * @namespace domains
 */
export const domains = {
    /**
     * Retrieves all domains from the watchlist for the home page list:
     * only the columns a domain card shows up front, with registrar and
     * lookup source derived in SQL. The raw lookup/NS/SSL JSON is left out -
     * an expanded card loads it on demand via {@link domains.getDetails}.
     * @async
     * @memberof domains
     * @returns {Promise<DomainListResponse>} Response object with domain list
     *
     * @example
     * const response = await domains.getAll();
     * if (response.status === 200) {
     *   console.log(`Found ${response.data.length} domains`);
     * }
     */
    async getAll() {
        const queryResult = await executeSql(DOMAIN_QUERIES.SELECT_ALL_DOMAINS);
        const domains = /** @type {DomainRecord[]} */ (
            queryResult?.results || []
        );
        return {
            status: 200,
            message: `Retrieved ${domains.length} domain${
                domains.length !== 1 ? "s" : ""
            }`,
            data: domains,
        };
    },

    /**
     * Retrieves the raw lookup data of one domain - the JSON an expanded
     * domain card shows. NS/SSL data that was never fetched (NULL, "null" or
     * "{}") comes back as null, so the card can simply hide that section.
     * @async
     * @memberof domains
     * @param {number} domainId - Domain ID
     * @returns {Promise<DomainDetails|null>} Raw JSON strings, or null when
     *   the domain doesn't exist
     * @throws {Error} Database errors propagate to the caller
     *
     * @example
     * const details = await domains.getDetails(42);
     * if (details?.rawNsData) console.log(JSON.parse(details.rawNsData));
     */
    async getDetails(domainId) {
        const row = await executeQueryFirst(
            DOMAIN_QUERIES.SELECT_DOMAIN_DETAILS_BY_ID,
            [domainId]
        );
        if (!row) return null;

        /**
         * @param {unknown} value - Stored JSON column value
         * @returns {string|null} The JSON string, or null when nothing was stored
         */
        const storedJsonOrNull = (value) =>
            typeof value === "string" &&
            value !== "" &&
            value !== "null" &&
            value !== "{}"
                ? value
                : null;

        return {
            rawDomainData:
                typeof row.raw_domain_data === "string"
                    ? row.raw_domain_data
                    : null,
            rawNsData: storedJsonOrNull(row.raw_ns_data),
            rawSslData: storedJsonOrNull(row.raw_ssl_data),
        };
    },

    /**
     * Adds a new domain to the watchlist
     * @async
     * @memberof domains
     * @param {string} domainName - The domain name to add (e.g., 'example.com')
     * @returns {Promise<DomainAddResponse>} Response object
     *
     * @example
     * const response = await domains.add('example.com');
     * if (response.status === 201) {
     *   console.log('Domain added successfully');
     * } else if (response.status === 409) {
     *   console.log('Domain already exists in watchlist');
     * }
     */
    async add(domainName) {
        try {
            const demoError = validateDemoMode();
            if (demoError) return demoError;

            const wasAdded = await executeDomainQuery(
                "INSERT_DOMAIN_IF_NOT_EXISTS",
                [domainName]
            );

            return wasAdded
                ? {
                      status: 201,
                      message: `"${domainName}" just joined the squad! 🎉`,
                  }
                : {
                      status: 409,
                      message: `Hold up! "${domainName}" is already on your radar 📡`,
                  };
        } catch (error) {
            console.error("❌ Failed to add domain to watchlist:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${getErrorMessage(error)}`,
            };
        }
    },
};

// ========================================
// DOMAIN VERIFICATION FOR NOTIFICATIONS
// ========================================

/**
 * Domain verification operations specifically designed for notification systems
 * and automated monitoring workflows
 * @namespace domainVerification
 */
export const domainVerification = {
    /**
     * Retrieves all domains categorized by their verification and expiration status.
     * Categories come straight from the flags computed by
     * SELECT_UNIFIED_DOMAINS_FOR_VERIFICATION (the single source of truth), and
     * every list keeps the query's order (verification_priority, then
     * last_domain_checked ASC). needingVerification, expiredRegistered and
     * needingRefresh are disjoint; expiring overlaps needingRefresh for
     * domains whose daily refresh is due.
     * @async
     * @memberof domainVerification
     * @returns {Promise<CategorizedDomains>} Categorized domain lists
     * @throws {Error} Database errors propagate to the caller (cron endpoint
     *   returns 500) instead of silently looking like "no domains"
     *
     * @example
     * const categories = await domainVerification.getAllDomainsForVerification();
     * console.log(`${categories.needingVerification.length} domains need verification`);
     * console.log(`${categories.expiredRegistered.length} expired domains still registered`);
     * console.log(`${categories.expiring.length} domains expiring soon`);
     * console.log(`${categories.needingRefresh.length} registered domains due for a refresh`);
     */
    async getAllDomainsForVerification() {
        try {
            const result = await executeSql(
                DOMAIN_QUERIES.SELECT_UNIFIED_DOMAINS_FOR_VERIFICATION
            );
            const domains = /** @type {VerificationCandidate[]} */ (
                result?.results || []
            );

            /** @type {CategorizedDomains} */
            const categorized = {
                needingVerification: domains.filter(
                    (d) => d.needs_verification === 1
                ),
                expiredRegistered: domains.filter(
                    (d) => d.is_expired_registered === 1
                ),
                expiring: domains.filter((d) => d.is_expiring_soon === 1),
                needingRefresh: domains.filter((d) => d.needs_refresh === 1),
            };

            console.log(
                `📊 Found ${categorized.needingVerification.length} needing verification, ${categorized.expiredRegistered.length} expired registered, ${categorized.expiring.length} expiring, ${categorized.needingRefresh.length} due for refresh`
            );
            return categorized;
        } catch (error) {
            console.error("❌ Error getting domains for verification:", error);
            throw error;
        }
    },

    /**
     * Snapshot of current DB state shaped for the daily report sections.
     * Derived from ONE unified SELECT: available = status 'available',
     * expired = registered with expires in the past, expiring = registered
     * within the warning window. Domains selected only for a refresh
     * (needingRefresh, future expiry outside the window) are never reported.
     * recentFailures lists the domains whose latest check failed within the
     * last 12 hours (SELECT_RECENT_CHECK_FAILURES), so a report that reuses
     * stored state still shows them.
     * Meant to run AFTER a verification batch so
     * the report reflects stored state (which failed checks preserve) instead
     * of only the checks that happened to succeed in this run.
     * @async
     * @memberof domainVerification
     * @returns {Promise<DomainReportState>} Domains grouped for report sections
     * @throws {Error} Database errors propagate to the caller
     *
     * @example
     * const state = await domainVerification.getDomainReportState();
     * console.log(`${state.available.length} domains currently available`);
     */
    async getDomainReportState() {
        const [categorized, failuresResult] = await Promise.all([
            this.getAllDomainsForVerification(),
            executeSql(DOMAIN_QUERIES.SELECT_RECENT_CHECK_FAILURES),
        ]);
        return {
            available: categorized.needingVerification.filter(
                (d) => d.status === DOMAIN_STATUS.AVAILABLE
            ),
            expired: categorized.expiredRegistered,
            expiring: categorized.expiring,
            recentFailures: /** @type {CheckFailure[]} */ (
                failuresResult?.results || []
            ),
        };
    },

    /**
     * Performs batch verification of a list of domains using the verification engine
     * @async
     * @memberof domainVerification
     * @param {DomainRecord[]} domains - Array of domain objects to verify
     * @param {BatchOptions} [options={}] - Configuration options for batch processing
     * @returns {Promise<BatchVerificationResult>} Batch verification results from verificationEngine.verifyBatch
     *
     * @example
     * const { needingVerification } = await domainVerification.getAllDomainsForVerification();
     * const results = await domainVerification.verifyDomainsBatch(needingVerification, {
     *   delayBetweenDomains: 100,
     *   batchSize: 5
     * });
     * console.log(`Verified ${results.checked} domains, ${results.available.length} now available`);
     */
    async verifyDomainsBatch(domains, options = {}) {
        return verificationEngine.verifyBatch(domains, options);
    },

    /**
     * Manual bulk check ("Check Domains" button): selects every due domain
     * (same unified query and categories as the cron, incl. due refreshes of
     * registered domains) and verifies one batch planned by planVerification -
     * alert-critical domains first, the rest round-robin by staleness -
     * capped at `limit` to respect lookup rate limits. Unlike scheduled runs
     * it doesn't skip domains checked within the last 12 hours. Every checked
     * domain moves to the back of its tier, so repeated clicks reach every
     * due domain.
     * @async
     * @memberof domainVerification
     * @param {number} [limit=CONFIG.LIMIT_DOMAIN_CHECKS] - Maximum number of domains to verify in this run
     * @returns {Promise<{results: BatchVerificationResult, total: number, processed: number}>}
     *   Batch results plus the total number of domains that needed a check and
     *   how many were actually processed (processed < total means truncation)
     * @throws {Error} Database errors propagate to the caller
     *
     * @example
     * const { results, total, processed } = await domainVerification.checkDomainsNeedingCheck();
     * if (total > processed) {
     *   console.log(`${total - processed} domains left for the next run`);
     * }
     */
    async checkDomainsNeedingCheck(limit = CONFIG.LIMIT_DOMAIN_CHECKS) {
        const categories = await this.getAllDomainsForVerification();
        const { domainsToVerify, deferred } = planVerification(categories, {
            manual: true,
            limit,
        });

        const results = await verificationEngine.verifyBatch(domainsToVerify);

        return {
            results,
            total: domainsToVerify.length + deferred,
            processed: domainsToVerify.length,
        };
    },
};

// ========================================
// TYPE DEFINITIONS FOR JSDOC
// ========================================

/**
 * @typedef {Object} DomainListResponse
 * @property {number} status - HTTP status code (200 for success, 500 for error)
 * @property {string} message - Human-readable status message
 * @property {DomainRecord[]} data - Domain list rows (SELECT_ALL_DOMAINS columns - no raw_* JSON)
 * @memberof module:DomainsServer
 */

/**
 * Raw lookup data of one domain, loaded on demand by an expanded domain card
 * @typedef {Object} DomainDetails
 * @property {string|null} rawDomainData - Stored lookup envelope JSON (RDAP/WhoisJSON), null if never checked
 * @property {string|null} rawNsData - NS lookup JSON, null if never fetched
 * @property {string|null} rawSslData - SSL certificate JSON, null if never fetched
 * @memberof module:DomainsServer
 */

/**
 * @typedef {Object} DomainAddResponse
 * @property {number} status - HTTP status code (201 for created, 409 for conflict, 403 for demo mode, 500 for error)
 * @property {string} message - Human-readable status message
 * @memberof module:DomainsServer
 */

/**
 * @typedef {Object} CategorizedDomains
 * @property {VerificationCandidate[]} needingVerification - available/error/not_checked (verify every run), or registered without expiry data not checked within 20 hours (daily)
 * @property {VerificationCandidate[]} expiredRegistered - Expired domains still showing as registered (verify every run)
 * @property {VerificationCandidate[]} expiring - Registered domains expiring within EXPIRY_WARNING_DAYS (report section)
 * @property {VerificationCandidate[]} needingRefresh - Registered domains with a future expiry whose refresh is due (verify only, never reported)
 * @memberof module:DomainsServer
 */

/**
 * @typedef {Object} DomainReportState
 * @property {DomainRecord[]} available - Domains currently available
 * @property {DomainRecord[]} expired - Expired domains still showing as registered
 * @property {DomainRecord[]} expiring - Domains expiring within the warning window
 * @property {CheckFailure[]} recentFailures - Domains whose latest check failed within the last 12 hours
 * @memberof module:DomainsServer
 */
