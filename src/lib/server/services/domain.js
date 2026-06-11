/**
 * @fileoverview Server-side domain management and verification services.
 * Provides domain watchlist management, verification workflows, and
 * comprehensive domain monitoring capabilities for notifications and automation.
 * @module DomainsServer
 */

import { executeSql } from "$src/lib/database/db";
import { DOMAIN_QUERIES } from "$src/lib/database/domain-queries";
import { getErrorMessage } from "$src/lib/utils/helpers";
import {
    validateDemoMode,
    executeDomainQuery,
    verificationEngine,
    CONFIG,
} from "$src/lib/server/utils/domain-utils.js";
import { EXPIRY_WARNING_DAYS } from "$lib/constants/constants";

/** @import { DomainRecord, BatchOptions, BatchVerificationResult } from "$lib/types" */

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
     * Retrieves all domains categorized by their verification and expiration status
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
     */
    async getAllDomainsForVerification() {
        try {
            const result = await executeSql(
                DOMAIN_QUERIES.SELECT_UNIFIED_DOMAINS_FOR_VERIFICATION
            );
            const domains = /** @type {DomainRecord[]} */ (
                result?.results || []
            );

            /** @type {CategorizedDomains} */
            const categorized = {
                needingVerification: domains.filter(
                    (d) =>
                        ["available", "error", "not_checked"].includes(
                            d.status ?? ""
                        ) &&
                        !(
                            d.expires &&
                            new Date(d.expires) < new Date() &&
                            d.status === "registered"
                        )
                ),
                expiredRegistered: domains.filter(
                    (d) =>
                        d.expires &&
                        new Date(d.expires) < new Date() &&
                        d.status === "registered"
                ),
                expiring: domains.filter(
                    (d) =>
                        d.expires &&
                        new Date(d.expires) > new Date() &&
                        new Date(d.expires) <=
                            new Date(
                                Date.now() +
                                    EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000
                            ) &&
                        d.status === "registered"
                ),
            };

            console.log(
                `📊 Found ${categorized.needingVerification.length} needing verification, ${categorized.expiredRegistered.length} expired registered, ${categorized.expiring.length} expiring`
            );
            return categorized;
        } catch (error) {
            console.error("❌ Error getting domains for verification:", error);
            throw error;
        }
    },

    /**
     * Retrieves domains that need their availability status verified
     * @async
     * @memberof domainVerification
     * @returns {Promise<DomainRecord[]>} Array of domain objects needing verification
     *
     * @example
     * const domains = await domainVerification.getDomainsNeedingVerification();
     * if (domains.length > 0) {
     *   console.log(`${domains.length} domains need verification`);
     * }
     */
    async getDomainsNeedingVerification() {
        const all = await this.getAllDomainsForVerification();
        return all.needingVerification;
    },

    /**
     * Retrieves domains that are expired but still showing as registered
     * These domains are high priority for re-checking availability
     * @async
     * @memberof domainVerification
     * @returns {Promise<DomainRecord[]>} Array of expired registered domain objects
     *
     * @example
     * const expiredDomains = await domainVerification.getExpiredRegisteredDomains();
     * if (expiredDomains.length > 0) {
     *   console.log(`${expiredDomains.length} expired domains might be available now`);
     * }
     */
    async getExpiredRegisteredDomains() {
        const all = await this.getAllDomainsForVerification();
        return all.expiredRegistered;
    },

    /**
     * Retrieves domains that will expire within the next 30 days
     * @async
     * @memberof domainVerification
     * @returns {Promise<DomainRecord[]>} Array of soon-to-expire domain objects
     *
     * @example
     * const expiringDomains = await domainVerification.getExpiringDomains();
     * if (expiringDomains.length > 0) {
     *   console.log(`${expiringDomains.length} domains expiring soon`);
     * }
     */
    async getExpiringDomains() {
        const all = await this.getAllDomainsForVerification();
        return all.expiring;
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
     * const domains = await domainVerification.getDomainsNeedingVerification();
     * const results = await domainVerification.verifyDomainsBatch(domains, {
     *   delayBetweenDomains: 100,
     *   batchSize: 5
     * });
     * console.log(`Verified ${results.checked} domains, ${results.available.length} now available`);
     */
    async verifyDomainsBatch(domains, options = {}) {
        return verificationEngine.verifyBatch(domains, options);
    },

    /**
     * Selects all domains needing a check and verifies them in one batch,
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
     * const expiredDomains = await domainVerification.getExpiredRegisteredDomains();
     * const results = await domainVerification.verifyExpiredDomainsBatch(expiredDomains);
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
 * @property {DomainRecord[]} needingVerification - Domains that need status verification
 * @property {DomainRecord[]} expiredRegistered - Expired domains still showing as registered
 * @property {DomainRecord[]} expiring - Domains expiring within 30 days
 * @memberof module:DomainsServer
 */
