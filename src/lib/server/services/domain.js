/**
 * @fileoverview Server-side domain management and verification services.
 * Provides domain watchlist management, verification workflows, and
 * comprehensive domain monitoring capabilities for notifications and automation.
 * @module DomainsServer
 */

import { executeSql } from "#lib/database/db.js";
import { DOMAIN_QUERIES } from "#lib/database/domain-queries.js";
import { getErrorMessage } from "#lib/utils/helpers.js";
import {
    validateDemoMode,
    executeDomainQuery,
    verificationEngine,
    CONFIG,
} from "#lib/server/utils/domain-utils.js";
import { DOMAIN_STATUS } from "#lib/constants/constants.js";

/** @import { DomainRecord, VerificationCandidate, BatchOptions, BatchVerificationResult } from "#lib/types.js" */

// ========================================
// DOMAIN WATCHLIST MANAGEMENT
// ========================================

/**
 * Domain watchlist management operations
 * @namespace domains
 */
export const domains = {
    /**
     * Retrieves all domains from the watchlist
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
        const categorized = await this.getAllDomainsForVerification();
        return {
            available: categorized.needingVerification.filter(
                (d) => d.status === DOMAIN_STATUS.AVAILABLE
            ),
            expired: categorized.expiredRegistered,
            expiring: categorized.expiring,
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
     * Selects all domains needing a check (SELECT_DOMAINS_NEEDING_CHECK, incl.
     * due refreshes of registered domains) and verifies them in one batch,
     * capped at `limit` to respect WHOIS API rate limits
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
        const queryResult = await executeSql(
            DOMAIN_QUERIES.SELECT_DOMAINS_NEEDING_CHECK
        );
        const domainsToCheck = /** @type {DomainRecord[]} */ (
            queryResult?.results || []
        );

        const domainsToProcess = domainsToCheck.slice(0, limit);
        const results = await verificationEngine.verifyBatch(domainsToProcess);

        return {
            results,
            total: domainsToCheck.length,
            processed: domainsToProcess.length,
        };
    },

    /**
     * Performs batch verification specifically for expired domains that might now be available
     * This is a specialized version of verifyDomainsBatch for high-priority expired domains
     * @async
     * @memberof domainVerification
     * @param {DomainRecord[]} expiredDomains - Array of expired domain objects to verify
     * @param {BatchOptions} [options={}] - Configuration options for batch processing
     * @returns {Promise<BatchVerificationResult>} Batch verification results from verificationEngine.verifyBatch
     *
     * @example
     * const { expiredRegistered } = await domainVerification.getAllDomainsForVerification();
     * const results = await domainVerification.verifyExpiredDomainsBatch(expiredRegistered);
     * if (results.available.length > 0) {
     *   console.log(`${results.available.length} expired domains are now available!`);
     *   // Send notifications or trigger alerts
     * }
     */
    async verifyExpiredDomainsBatch(expiredDomains, options = {}) {
        return verificationEngine.verifyBatch(expiredDomains, options);
    },
};

// ========================================
// TYPE DEFINITIONS FOR JSDOC
// ========================================

/**
 * @typedef {Object} DomainListResponse
 * @property {number} status - HTTP status code (200 for success, 500 for error)
 * @property {string} message - Human-readable status message
 * @property {DomainRecord[]} data - Array of domain objects
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
 * @property {VerificationCandidate[]} needingVerification - available/error/not_checked, or registered without expiry data (verify every run)
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
 * @memberof module:DomainsServer
 */
