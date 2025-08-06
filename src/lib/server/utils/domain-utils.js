/**
 * @fileoverview Shared utilities and services for domain management operations.
 * Provides common validation, verification engine, and utility functions used
 * across domain-related services and remote functions.
 * @module DomainUtils
 */

import { executeSql, executeQueryFirst } from "$src/lib/database/db";
import { DOMAIN_QUERIES } from "$src/lib/database/domain-queries";
import * as whoisService from "$src/lib/server/infrastructure/whois-client";
import { isDemo } from "$src/lib/utils/helpers";
import { apiKey } from "$src/lib/server/infrastructure/api-key.js";
import { DOMAIN_STATUS } from "$lib/constants/constants";

// ========================================
// CONFIGURATION CONSTANTS
// ========================================

/**
 * Configuration constants for domain verification and batch processing operations
 * @namespace CONFIG
 * @readonly
 * @memberof module:DomainUtils
 * @property {number} LIMIT_DOMAIN_CHECKS - Maximum number of domains to check in a single batch operation
 * @property {number} DELAY_BETWEEN_DOMAINS - Delay in milliseconds between domain checks to avoid rate limiting
 * @property {number} BATCH_SIZE - Number of domains to process simultaneously in each batch
 */
export const CONFIG = {
    /** Maximum number of domains to check in a single batch */
    LIMIT_DOMAIN_CHECKS: 20,
    /** Delay between domain checks in milliseconds to avoid rate limiting */
    DELAY_BETWEEN_DOMAINS: 100,
    /** Number of domains to process simultaneously in each batch */
    BATCH_SIZE: 5,
};

// ========================================
// VALIDATION FUNCTIONS
// ========================================

/**
 * Validates if the user has access to domain verification features.
 * Checks both demo mode restrictions and API key configuration.
 *
 * @async
 * @function validateAccess
 * @memberof module:DomainUtils
 * @returns {Promise<ValidationError|null>} Error object if access denied, null if access granted
 * @throws {Error} When API key validation fails unexpectedly
 *
 * @example
 * ```javascript
 * const accessError = await validateAccess();
 * if (accessError) {
 *   return { status: accessError.status, message: accessError.message };
 * }
 * // Proceed with domain operations...
 * ```
 *
 */
export const validateAccess = async () => {
    if (isDemo())
        return {
            status: 403,
            message: "Demo mode: Look but don't touch 👀",
        };
    if (!(await apiKey.isConfigured()))
        return {
            status: 400,
            message:
                "No API key, no party 🎉 Drop your API key in Settings first, then we're good to go",
        };
    return null;
};

/**
 * Validates if the application is not in demo mode.
 * Used for operations that modify data but don't require API key validation.
 *
 * @function validateDemoMode
 * @memberof module:DomainUtils
 * @returns {ValidationError|null} Error object if in demo mode, null otherwise
 *
 * @example
 * ```javascript
 * const demoError = validateDemoMode();
 * if (demoError) {
 *   return demoError;
 * }
 * // Proceed with write operations...
 * ```
 *
 */
export const validateDemoMode = () =>
    isDemo()
        ? { status: 403, message: "Demo mode: Look but don't touch 👀" }
        : null;

// ========================================
// DATABASE UTILITY FUNCTIONS
// ========================================

/**
 * Retrieves a domain record by its unique identifier from the database.
 *
 * @async
 * @function findDomainById
 * @memberof module:DomainUtils
 * @param {number|string} domainId - The unique identifier of the domain
 * @returns {Promise<DomainRecord|null>} Domain object if found, null otherwise
 * @throws {Error} Database connection or query errors
 *
 * @example
 * ```javascript
 * const domain = await findDomainById(123);
 * if (domain) {
 *   console.log(`Found domain: ${domain.domain_name}`);
 * } else {
 *   console.log('Domain not found');
 * }
 * ```
 *
 */
export const findDomainById = async (domainId) => {
    const domain = await executeQueryFirst(DOMAIN_QUERIES.SELECT_DOMAIN_BY_ID, [
        domainId,
    ]);
    return domain || null;
};

/**
 * Executes a domain-related database query and returns success status.
 * Provides a standardized way to execute domain queries and check if they affected any rows.
 *
 * @async
 * @function executeDomainQuery
 * @memberof module:DomainUtils
 * @param {string} queryKey - Key from DOMAIN_QUERIES object
 * @param {Array} params - Parameters for the SQL query
 * @returns {Promise<boolean>} True if query affected at least one row, false otherwise
 * @throws {Error} Database connection or query errors
 *
 * @example
 * ```javascript
 * const wasUpdated = await executeDomainQuery('UPDATE_DOMAIN_STATUS', [
 *   'available',
 *   domainId
 * ]);
 * if (wasUpdated) {
 *   console.log('Domain status updated successfully');
 * }
 * ```
 *
 */
export const executeDomainQuery = async (queryKey, params) => {
    const result = await executeSql(DOMAIN_QUERIES[queryKey], params);
    return result.meta?.changes > 0;
};

// ========================================
// DOMAIN VERIFICATION ENGINE
// ========================================

/**
 * Core verification engine for domain status checking and batch processing.
 * Provides comprehensive domain verification capabilities with error handling,
 * rate limiting, and detailed result reporting.
 *
 * @namespace verificationEngine
 * @memberof module:DomainUtils
 */
export const verificationEngine = {
    /**
     * Verifies the availability status of a single domain through WHOIS lookup.
     * Handles both successful verifications and error cases, updating the database
     * with current domain status and expiration information.
     *
     * @async
     * @memberof module:DomainUtils.verificationEngine
     * @param {DomainRecord} domain - Domain object from database
     * @param {number} domain.id - Unique domain identifier
     * @param {string} domain.domain_name - The domain name to verify
     * @param {string} [domain.expires] - Current expiration date if known
     * @returns {Promise<VerificationResult>} Verification result object
     * @throws {Error} Database or network connectivity errors
     *
     * @example
     * ```javascript
     * const result = await verificationEngine.verifyDomain({
     *   id: 123,
     *   domain_name: 'example.com',
     *   expires: '2024-12-31'
     * });
     *
     * if (result.success && result.wasAvailable) {
     *   console.log(`${result.domain} is now available!`);
     *   // Send notification or trigger alert
     * } else if (result.success && result.isStillRegistered) {
     *   console.log(`${result.domain} remains registered`);
     * } else {
     *   console.error(`Verification failed: ${result.error}`);
     * }
     * ```
     *
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
     * Verifies multiple domains in configurable batches with rate limiting.
     * Processes domains in parallel batches while respecting rate limits and
     * providing detailed progress reporting and error handling.
     *
     * @async
     * @memberof module:DomainUtils.verificationEngine
     * @param {DomainRecord[]} domains - Array of domain objects to verify
     * @param {BatchOptions} [options={}] - Configuration options for batch processing
     * @param {number} [options.delayBetweenDomains=CONFIG.DELAY_BETWEEN_DOMAINS] - Delay between batches in milliseconds
     * @param {number} [options.batchSize=CONFIG.BATCH_SIZE] - Number of domains to process per batch
     * @returns {Promise<BatchVerificationResult>} Comprehensive batch verification results
     *
     * @example
     * ```javascript
     * const domains = [
     *   { id: 1, domain_name: 'example1.com' },
     *   { id: 2, domain_name: 'example2.com' }
     * ];
     *
     * const results = await verificationEngine.verifyBatch(domains, {
     *   delayBetweenDomains: 200,
     *   batchSize: 3
     * });
     *
     * console.log(`Processed: ${results.checked} domains`);
     * console.log(`Available: ${results.available.length} domains`);
     * console.log(`Still registered: ${results.stillRegistered.length} domains`);
     * console.log(`Errors: ${results.errors} domains`);
     *
     * if (results.available.length > 0) {
     *   // Trigger notifications for newly available domains
     *   notificationService.sendAvailabilityAlerts(results.available);
     * }
     * ```
     *
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

            const batchResults = await Promise.allSettled(batchPromises);

            // Collect results using allSettled pattern
            batchResults.forEach((settledResult, index) => {
                if (settledResult.status === "fulfilled") {
                    const verifyResult = settledResult.value;

                    if (verifyResult.success) {
                        if (verifyResult.wasAvailable) {
                            const domain = domains.find(
                                (d) => d.domain_name === verifyResult.domain
                            );
                            if (domain) results.available.push(domain);
                        } else if (verifyResult.isStillRegistered) {
                            const domain = domains.find(
                                (d) => d.domain_name === verifyResult.domain
                            );
                            if (domain) {
                                const isExpired =
                                    domain.expires &&
                                    new Date(domain.expires) < new Date();
                                if (isExpired) {
                                    results.stillRegistered.push(domain);
                                }
                            }
                        }
                    } else {
                        // Handle verification errors
                        results.errors++;
                        results.errorMessages.push(
                            `${verifyResult.domain}: ${verifyResult.error}`
                        );
                    }
                } else {
                    // Handle promise rejection
                    const domainName = batch[index]?.domain_name || "unknown";
                    results.errors++;
                    results.errorMessages.push(
                        `${domainName}: Promise rejected - ${settledResult.reason}`
                    );
                    console.error(
                        `🚨 Promise rejected for ${domainName}:`,
                        settledResult.reason
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
// TYPE DEFINITIONS FOR JSDOC
// ========================================

/**
 * @typedef {Object} ValidationError
 * @property {number} status - HTTP status code (403 for demo mode, 400 for missing API key)
 * @property {string} message - Human-readable error message
 * @memberof module:DomainUtils
 */

/**
 * @typedef {Object} DomainRecord
 * @property {number} id - Unique domain identifier
 * @property {string} domain_name - The domain name
 * @property {string} [status] - Current domain status (available, registered, error, not_checked)
 * @property {string} [expires] - Domain expiration date in ISO format
 * @property {string} [created_at] - Record creation timestamp
 * @property {string} [updated_at] - Record last update timestamp
 * @property {Object} [whois_data] - Full WHOIS data as JSON object
 * @property {Object} [ssl_data] - SSL certificate data as JSON object
 * @property {Object} [ns_data] - Nameserver data as JSON object
 * @memberof module:DomainUtils
 */

/**
 * @typedef {Object} VerificationResult
 * @property {boolean} success - Whether verification completed successfully
 * @property {string} domain - The domain name that was checked
 * @property {string} [status] - Domain status (available, registered, error)
 * @property {boolean} [wasAvailable] - True if domain is now available
 * @property {boolean} [isStillRegistered] - True if domain remains registered
 * @property {string} [error] - Error message if verification failed
 * @memberof module:DomainUtils
 */

/**
 * @typedef {Object} BatchOptions
 * @property {number} [delayBetweenDomains] - Delay between batches in milliseconds
 * @property {number} [batchSize] - Number of domains to process per batch
 * @memberof module:DomainUtils
 */

/**
 * @typedef {Object} BatchVerificationResult
 * @property {number} checked - Total number of domains processed
 * @property {DomainRecord[]} available - Domains that became available
 * @property {DomainRecord[]} stillRegistered - Expired domains still registered
 * @property {number} errors - Number of domains that failed verification
 * @property {string[]} errorMessages - Detailed error messages for failed verifications
 * @memberof module:DomainUtils
 */
