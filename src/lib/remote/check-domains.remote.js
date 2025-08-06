/**
 * @fileoverview Domain management service for monitoring domain availability,
 * SSL certificates, and nameserver records. Provides batch verification
 * capabilities with rate limiting and error handling.
 * @module DomainService
 */

import { executeSql } from "$src/lib/database/db";
import { DOMAIN_QUERIES } from "$src/lib/database/domain-queries";
import * as whoisService from "$src/lib/server/infrastructure/whois-client";
import { isDemo } from "$src/lib/utils/helpers";
import { apiKey } from "$src/lib/server/infrastructure/api-key.js";
import { DOMAIN_STATUS } from "$lib/constants/constants";
import { form } from "$app/server";

// ========================================
// CONFIGURATION
// ========================================

/**
 * Configuration constants for domain verification operations
 * @namespace CONFIG
 * @readonly
 */
const CONFIG = {
    /** Maximum number of domains to check in a single batch */
    LIMIT_DOMAIN_CHECKS: 20,
    /** Delay between domain checks in milliseconds to avoid rate limiting */
    DELAY_BETWEEN_DOMAINS: 100,
    /** Number of domains to process simultaneously in each batch */
    BATCH_SIZE: 5,
};

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Validates if the user has access to domain verification features
 * @async
 * @function validateAccess
 * @returns {Promise<Object|null>} Error object if access denied, null if access granted
 * @returns {number} returns.status - HTTP status code (403 for demo mode, 400 for missing API key)
 * @returns {string} returns.message - Human-readable error message
 */
const validateAccess = async () => {
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

/**
 * Performs batch verification of multiple domains with rate limiting
 * @async
 * @param {Object} [options={}] - Configuration options for batch processing
 * @param {number} [options.limit=20] - Maximum number of domains to process
 * @param {number} [options.delayBetweenDomains=CONFIG.DELAY_BETWEEN_DOMAINS] - Delay between batches in milliseconds
 * @param {number} [options.batchSize=CONFIG.BATCH_SIZE] - Number of domains to process per batch
 * @returns {Promise<Object>} Response object with batch verification results
 * @returns {number} returns.status - HTTP status code (200 for success, 204 for no domains to check, 207 for partial success, 422 for mostly failed, 403 for demo mode, 400 for missing API key, 500 for error)
 * @returns {string} returns.message - Human-readable status message with statistics
 * @returns {Object} [returns.results] - Detailed statistics if there were errors
 * @returns {number} [returns.results.total] - Total domains processed
 * @returns {number} [returns.results.successful] - Successfully processed domains
 * @returns {number} [returns.results.errors] - Number of failed verifications
 * @returns {number} [returns.results.successRate] - Success rate as percentage
 *
 * @example
 * const response = await check.batch({
 *   limit: 10,
 *   delayBetweenDomains: 150,
 *   batchSize: 3
 * });
 * if (response.status === 200) {
 *   console.log('All domains verified successfully');
 * } else if (response.status === 207) {
 *   console.log(`Partial success: ${response.results.successRate}% success rate`);
 * }
 */

export const batchCheck = form(async (data) => {
    try {
        const accessError = await validateAccess();
        if (accessError) return accessError;

        const queryResult = await executeSql(
            DOMAIN_QUERIES.SELECT_DOMAINS_NEEDING_CHECK
        );
        const domainsToCheck = queryResult?.results || [];

        if (!domainsToCheck.length) {
            return {
                status: 204,
                message:
                    "Your domains are all caught up - nothing to do here! 😎",
            };
        }

        const domainsToProcess = domainsToCheck.slice(
            0,
            CONFIG.LIMIT_DOMAIN_CHECKS
        );
        const results = await verificationEngine.verifyBatch(domainsToProcess);

        // Simple status
        if (results.errors > 0) {
            const successRate = Math.round(
                ((results.checked - results.errors) / results.checked) * 100
            );
            return {
                status: successRate < 50 ? 422 : 207,
                message: `${successRate}% success rate! ${
                    results.checked - results.errors
                }/${
                    results.checked
                } domains cooperated, others were stubborn 😅: ${results.errorMessages.join(
                    "; "
                )}`,
                results: {
                    total: results.checked,
                    successful: results.checked - results.errors,
                    errors: results.errors,
                    successRate,
                },
            };
        } else {
            return {
                status: 200,
                message: `Boom! ${results.checked}/${results.checked} domains checked - 100% success rate! 🎯`,
            };
        }
    } catch (error) {
        console.error("❌ Failed to perform batch domain verification:", error);
        return {
            status: 500,
            message: `Houston, we have a problem: ${error.message}`,
        };
    }
});

// ========================================
// TYPE DEFINITIONS FOR JSDOC
// ========================================

/**
 * @typedef {Object} BatchServiceResponse
 * @property {number} status - HTTP status code (200 for success, 204 for no domains, 207 for partial success, 422 for mostly failed, 403 for demo mode, 400 for missing API key, 500 for error)
 * @property {string} message - Human-readable status message with statistics
 * @property {Object} [results] - Detailed statistics if there were errors
 * @property {number} [results.total] - Total domains processed
 * @property {number} [results.successful] - Successfully processed domains
 * @property {number} [results.errors] - Number of failed verifications
 * @property {number} [results.successRate] - Success rate as percentage
 * @memberof module:CheckDomainsRemote
 */
