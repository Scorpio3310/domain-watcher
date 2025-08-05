/**
 * @fileoverview Domain management service for monitoring domain availability,
 * SSL certificates, and nameserver records. Provides batch verification
 * capabilities with rate limiting and error handling.
 * @module DomainService
 */

import { executeSql, executeQueryFirst } from "$src/lib/database/db";
import { DOMAIN_QUERIES } from "$src/lib/database/domain-queries";
import * as whoisService from "$src/lib/server/whois";
import { isDemo } from "$src/lib/utils/helpers";
import { DOMAIN_STATUS } from "$lib/constants/constants";

// ========================================
// CONFIGURATION
// ========================================

/**
 * Configuration constants for domain verification operations
 * @namespace CONFIG
 * @readonly
 */
const CONFIG = {
    /** Delay between domain checks in milliseconds to avoid rate limiting */
    DELAY_BETWEEN_DOMAINS: 100,
    /** Number of domains to process simultaneously in each batch */
    BATCH_SIZE: 5,
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Validates if the application is not in demo mode
 * @function validateDemoMode
 * @returns {Object|null} Error object if in demo mode, null otherwise
 * @returns {number} returns.status - HTTP status code (403)
 * @returns {string} returns.message - Human-readable error message
 */
const validateDemoMode = () =>
    isDemo()
        ? { status: 403, message: "Demo mode: Look but don't touch 👀" }
        : null;

/**
 * Executes a domain-related database query and returns success status
 * @async
 * @function executeDomainQuery
 * @param {string} queryKey - Key from DOMAIN_QUERIES object
 * @param {Array} params - Parameters for the SQL query
 * @returns {Promise<boolean>} True if query affected at least one row, false otherwise
 * @throws {Error} Database connection or query errors
 */
const executeDomainQuery = async (queryKey, params) => {
    const result = await executeSql(DOMAIN_QUERIES[queryKey], params);
    return result.meta?.changes > 0;
};

// ========================================
// VERIFICATION ENGINE
// ========================================

/**
 * Core verification engine for domain status checking
 * @namespace verificationEngine
 */
const verificationEngine = {
    /**
     * Verifies the availability status of a single domain
     * @async
     * @memberof verificationEngine
     * @param {Object} domain - Domain object from database
     * @param {number} domain.id - Unique domain identifier
     * @param {string} domain.domain_name - The domain name to verify
     * @param {string} [domain.expires] - Current expiration date if known
     * @returns {Promise<Object>} Verification result object
     * @returns {boolean} returns.success - Whether verification completed successfully
     * @returns {string} returns.domain - The domain name that was checked
     * @returns {string} [returns.status] - Domain status (available, registered, error)
     * @returns {boolean} [returns.wasAvailable] - True if domain is now available
     * @returns {boolean} [returns.isStillRegistered] - True if domain remains registered
     * @returns {string} [returns.error] - Error message if verification failed
     *
     * @example
     * const result = await verificationEngine.verifyDomain({
     *   id: 123,
     *   domain_name: 'example.com',
     *   expires: '2024-12-31'
     * });
     * if (result.success && result.wasAvailable) {
     *   console.log(`${result.domain} is now available!`);
     * }
     */
    async verifyDomain(domain) {
        try {
            console.log(`🔍 Checking ${domain.domain_name}...`);

            const result = await whoisService.checkDomainAvailability(
                domain.domain_name
            );

            if (result.status === 200 && result.data) {
                // ALWAYS save full domain data - not just availability
                await executeSql(DOMAIN_QUERIES.UPDATE_DOMAIN, [
                    result.data.status || DOMAIN_STATUS.ERROR,
                    result.data.expires || null,
                    JSON.stringify(result.data),
                    domain.id,
                ]);

                const wasAvailable = result.data.status === "available";
                const isStillRegistered = result.data.status === "registered";
                const isExpired =
                    domain.expires && new Date(domain.expires) < new Date();

                if (isExpired && wasAvailable) {
                    console.log(`✅ NOW AVAILABLE: ${domain.domain_name}`);
                } else if (isExpired && isStillRegistered) {
                    console.log(`🚨 STILL REGISTERED: ${domain.domain_name}`);
                }

                return {
                    success: true,
                    domain: domain.domain_name,
                    status: result.data.status,
                    wasAvailable,
                    isStillRegistered,
                };
            } else {
                const errorMessage =
                    result.originalMessage || result.message || "Unknown error";
                // Mark as error
                await executeSql(DOMAIN_QUERIES.UPDATE_DOMAIN_ERROR, [
                    errorMessage,
                    domain.id,
                ]);

                console.log(
                    `❌ ERROR: ${domain.domain_name} - ${errorMessage}`
                );

                return {
                    success: false,
                    domain: domain.domain_name,
                    error: errorMessage,
                };
            }
        } catch (error) {
            // Mark as error
            await executeSql(DOMAIN_QUERIES.UPDATE_DOMAIN_ERROR, [domain.id]);

            const errorMessage =
                error.originalMessage || error.message || "Unknown error";
            console.error(`❌ ERROR: ${domain.domain_name} - ${errorMessage}`);

            return {
                success: false,
                domain: domain.domain_name,
                error: errorMessage,
            };
        }
    },

    /**
     * Verifies multiple domains in batches with configurable delays and parallelism
     * @async
     * @memberof verificationEngine
     * @param {Array<Object>} domains - Array of domain objects to verify
     * @param {Object} [options={}] - Configuration options for batch processing
     * @param {number} [options.delayBetweenDomains=CONFIG.DELAY_BETWEEN_DOMAINS] - Delay between batches in milliseconds
     * @param {number} [options.batchSize=CONFIG.BATCH_SIZE] - Number of domains to process per batch
     * @returns {Promise<Object>} Batch verification results
     * @returns {number} returns.checked - Total number of domains processed
     * @returns {Array<Object>} returns.available - Domains that became available
     * @returns {Array<Object>} returns.stillRegistered - Expired domains still registered
     * @returns {number} returns.errors - Number of domains that failed verification
     * @returns {Array<string>} returns.errorMessages - Detailed error messages
     *
     * @example
     * const domains = [
     *   { id: 1, domain_name: 'example1.com' },
     *   { id: 2, domain_name: 'example2.com' }
     * ];
     * const results = await verificationEngine.verifyBatch(domains, {
     *   delayBetweenDomains: 200,
     *   batchSize: 3
     * });
     * console.log(`Checked ${results.checked} domains, ${results.available.length} now available`);
     */
    async verifyBatch(domains, options = {}) {
        const {
            delayBetweenDomains = CONFIG.DELAY_BETWEEN_DOMAINS,
            batchSize = CONFIG.BATCH_SIZE,
        } = options;

        if (!domains.length) {
            return {
                checked: 0,
                available: [],
                stillRegistered: [],
                errors: 0,
                errorMessages: [],
            };
        }

        console.log(
            `📊 Verifying ${domains.length} domains (delay: ${delayBetweenDomains}ms, batch: ${batchSize})...`
        );

        const results = {
            checked: 0,
            available: [],
            stillRegistered: [],
            errors: 0,
            errorMessages: [],
        };

        // Process domains in batches
        for (let i = 0; i < domains.length; i += batchSize) {
            const batch = domains.slice(i, i + batchSize);

            // Process batch in parallel
            const batchPromises = batch.map(async (domain) => {
                results.checked++;
                console.log(
                    `[${results.checked}/${domains.length}] ${domain.domain_name}...`
                );
                return this.verifyDomain(domain);
            });

            const batchResults = await Promise.all(batchPromises);

            // Collect results
            batchResults.forEach((verifyResult) => {
                if (verifyResult.success) {
                    if (verifyResult.wasAvailable) {
                        results.available.push(
                            domains.find(
                                (d) => d.domain_name === verifyResult.domain
                            )
                        );
                    } else if (verifyResult.isStillRegistered) {
                        const domain = domains.find(
                            (d) => d.domain_name === verifyResult.domain
                        );
                        const isExpired =
                            domain.expires &&
                            new Date(domain.expires) < new Date();
                        if (isExpired) {
                            results.stillRegistered.push(domain);
                        }
                    }
                } else {
                    results.errors++;
                    results.errorMessages.push(
                        `${verifyResult.domain}: ${verifyResult.error}`
                    );
                }
            });

            // Simple delay between batches (not between individual domains)
            if (delayBetweenDomains > 0 && i + batchSize < domains.length) {
                await new Promise((resolve) =>
                    setTimeout(resolve, delayBetweenDomains)
                );
            }
        }

        console.log(
            `✅ Verification complete: ${results.available.length} available, ${results.stillRegistered.length} still registered, ${results.errors} errors`
        );

        return results;
    },
};

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
     * @returns {Promise<Object>} Response object with domain list
     * @returns {number} returns.status - HTTP status code (200 for success, 500 for error)
     * @returns {string} returns.message - Human-readable status message
     * @returns {Array<Object>} returns.data - Array of domain objects
     *
     * @example
     * const response = await domains.getAll();
     * if (response.status === 200) {
     *   console.log(`Found ${response.data.length} domains`);
     * }
     */
    async getAll() {
        const queryResult = await executeSql(DOMAIN_QUERIES.SELECT_ALL_DOMAINS);
        const domains = queryResult?.results || [];
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
     * @returns {Promise<Object>} Response object
     * @returns {number} returns.status - HTTP status code (201 for created, 409 for conflict, 403 for demo mode, 500 for error)
     * @returns {string} returns.message - Human-readable status message
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
                message: `Houston, we have a problem: ${error.message}`,
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
     * @returns {Promise<Object>} Categorized domain lists
     * @returns {Array<Object>} returns.needingVerification - Domains that need status verification
     * @returns {Array<Object>} returns.expiredRegistered - Expired domains still showing as registered
     * @returns {Array<Object>} returns.expiring - Domains expiring within 30 days
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
            const domains = result?.results || [];

            const categorized = {
                needingVerification: domains.filter(
                    (d) =>
                        ["available", "error", "not_checked"].includes(
                            d.status
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
                            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) &&
                        d.status === "registered"
                ),
            };

            console.log(
                `📊 Found ${categorized.needingVerification.length} needing verification, ${categorized.expiredRegistered.length} expired registered, ${categorized.expiring.length} expiring`
            );
            return categorized;
        } catch (error) {
            console.error("❌ Error getting domains for verification:", error);
            return {
                needingVerification: [],
                expiredRegistered: [],
                expiring: [],
            };
        }
    },

    /**
     * Retrieves domains that need their availability status verified
     * @async
     * @memberof domainVerification
     * @returns {Promise<Array<Object>>} Array of domain objects needing verification
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
     * @returns {Promise<Array<Object>>} Array of expired registered domain objects
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
     * @returns {Promise<Array<Object>>} Array of soon-to-expire domain objects
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
     * @param {Array<Object>} domains - Array of domain objects to verify
     * @param {Object} [options={}] - Configuration options for batch processing
     * @param {number} [options.delayBetweenDomains] - Delay between batches in milliseconds
     * @param {number} [options.batchSize] - Number of domains to process per batch
     * @returns {Promise<Object>} Batch verification results from verificationEngine.verifyBatch
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
     * Performs batch verification specifically for expired domains that might now be available
     * This is a specialized version of verifyDomainsBatch for high-priority expired domains
     * @async
     * @memberof domainVerification
     * @param {Array<Object>} expiredDomains - Array of expired domain objects to verify
     * @param {Object} [options={}] - Configuration options for batch processing
     * @param {number} [options.delayBetweenDomains] - Delay between batches in milliseconds
     * @param {number} [options.batchSize] - Number of domains to process per batch
     * @returns {Promise<Object>} Batch verification results from verificationEngine.verifyBatch
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
