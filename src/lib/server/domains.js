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
import { apiKey } from "$src/lib/server/api-key.js";
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
 * Retrieves a domain record by its unique identifier
 * @async
 * @function findDomainById
 * @param {number|string} domainId - The unique identifier of the domain
 * @returns {Promise<Object|null>} Domain object if found, null otherwise
 * @throws {Error} Database connection or query errors
 */
const findDomainById = async (domainId) => {
    const domain = await executeQueryFirst(DOMAIN_QUERIES.SELECT_DOMAIN_BY_ID, [
        domainId,
    ]);
    return domain || null;
};

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

    /**
     * Removes a domain from the watchlist
     * @async
     * @memberof domains
     * @param {number|string} domainId - The unique identifier of the domain to remove
     * @returns {Promise<Object>} Response object
     * @returns {number} returns.status - HTTP status code (200 for success, 404 for not found, 403 for demo mode, 500 for error)
     * @returns {string} returns.message - Human-readable status message
     *
     * @example
     * const response = await domains.remove(123);
     * if (response.status === 200) {
     *   console.log('Domain removed successfully');
     * } else if (response.status === 404) {
     *   console.log('Domain not found');
     * }
     */
    async remove(domainId) {
        try {
            const demoError = validateDemoMode();
            if (demoError) return demoError;

            const domain = await findDomainById(domainId);
            if (!domain)
                return {
                    status: 404,
                    message:
                        "Hmm, can't find that domain anywhere - maybe it escaped already? 🤔",
                };

            const wasRemoved = await executeDomainQuery("DELETE_DOMAIN", [
                domainId,
            ]);
            console.log(wasRemoved);

            return wasRemoved
                ? {
                      status: 200,
                      message: `"${domain.domain_name}" vanished from your watchlist ✨`,
                  }
                : {
                      status: 500,
                      message:
                          "Oops! The domain didn't want to leave - technical hiccup on our end 😅",
                  };
        } catch (error) {
            console.error("❌ Failed to remove domain from watchlist:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${error.message}`,
            };
        }
    },
};

// ========================================
// VERIFICATION OPERATIONS
// ========================================

/**
 * Domain verification and checking operations
 * @namespace check
 */
export const check = {
    /**
     * Performs nameserver (NS) lookup for a specific domain
     * @async
     * @memberof check
     * @param {number|string} domainId - The unique identifier of the domain
     * @returns {Promise<Object>} Response object with NS lookup results
     * @returns {number} returns.status - HTTP status code (200 for success, 404 for not found, 403 for demo mode, 400 for missing API key, 500 for error)
     * @returns {string} returns.message - Human-readable status message
     * @returns {Object} [returns.data] - NS lookup data if successful
     *
     * @example
     * const response = await check.ns(123);
     * if (response.status === 200) {
     *   console.log('NS lookup completed:', response.data);
     * }
     */
    async ns(domainId) {
        const accessError = await validateAccess();
        if (accessError) return accessError;

        const domain = await findDomainById(domainId);
        if (!domain)
            return {
                status: 404,
                message:
                    "Hmm, can't find that domain anywhere - maybe it escaped already? 🤔",
            };

        try {
            const apiResult = await whoisService.checkDomainNS(
                domain.domain_name
            );

            if (apiResult?.status !== 200) {
                return {
                    status: apiResult?.status || 500,
                    message:
                        apiResult?.message ||
                        `"${domain.domain_name}" is being shy - give it another shot! 🎯`,
                };
            }

            const saved = await executeDomainQuery("UPDATE_DOMAIN_NS", [
                JSON.stringify(apiResult.data),
                domainId,
            ]);
            return saved
                ? {
                      status: 200,
                      message: `"${domain.domain_name}" NS lookup complete - all data captured ✨`,
                      data: apiResult.data,
                  }
                : {
                      status: 500,
                      message: `NS lookup worked, but our database got distracted - one more time! 😅`,
                  };
        } catch (error) {
            console.error("❌ Failed to perform NS Lookup:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${error.message}`,
            };
        }
    },

    /**
     * Performs SSL certificate check for a specific domain
     * @async
     * @memberof check
     * @param {number|string} domainId - The unique identifier of the domain
     * @returns {Promise<Object>} Response object with SSL certificate information
     * @returns {number} returns.status - HTTP status code (200 for success, 404 for not found, 403 for demo mode, 400 for missing API key, 500 for error)
     * @returns {string} returns.message - Human-readable status message
     * @returns {Object} [returns.data] - SSL certificate data if successful
     *
     * @example
     * const response = await check.ssl(123);
     * if (response.status === 200) {
     *   console.log('SSL check completed:', response.data);
     * }
     */
    async ssl(domainId) {
        const accessError = await validateAccess();
        if (accessError) return accessError;

        const domain = await findDomainById(domainId);
        if (!domain)
            return {
                status: 404,
                message:
                    "Hmm, can't find that domain anywhere - maybe it escaped already? 🤔",
            };

        try {
            const apiResult = await whoisService.checkDomainSSL(
                domain.domain_name
            );

            if (apiResult?.status !== 200) {
                return {
                    status: apiResult?.status || 500,
                    message:
                        apiResult?.message ||
                        `SSL check for "${domain.domain_name}" didn't cooperate - give it another shot! 🎯`,
                };
            }

            const saved = await executeDomainQuery("UPDATE_DOMAIN_SSL", [
                JSON.stringify(apiResult.data),
                domainId,
            ]);
            return saved
                ? {
                      status: 200,
                      message: `SSL detective work complete for "${domain.domain_name}" - all good! 🕵️`,
                      data: apiResult.data,
                  }
                : {
                      status: 500,
                      message: `Got the SSL info but couldn't save it - database needs a coffee break? ☕️`,
                  };
        } catch (error) {
            console.error("❌ Failed to perform SSL Lookup:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${error.message}`,
            };
        }
    },

    /**
     * Verifies the availability status of a single domain
     * @async
     * @memberof check
     * @param {number|string} domainId - The unique identifier of the domain
     * @returns {Promise<Object>} Response object with verification results
     * @returns {number} returns.status - HTTP status code (200 for success, 404 for not found, 403 for demo mode, 400 for missing API key, 500 for error)
     * @returns {string} returns.message - Human-readable status message
     *
     * @example
     * const response = await check.domain(123);
     * if (response.status === 200) {
     *   console.log('Domain verification completed');
     * }
     */
    async domain(domainId) {
        try {
            const accessError = await validateAccess();
            if (accessError) return accessError;

            const domain = await findDomainById(domainId);
            if (!domain)
                return {
                    status: 404,
                    message:
                        "Hmm, can't find that domain anywhere - maybe it escaped already? 🤔",
                };

            const verifyResult = await verificationEngine.verifyDomain(domain);

            return verifyResult.success
                ? {
                      status: 200,
                      message: `"${domain.domain_name}" analyzed - all the juicy details are ready! 🔍`,
                  }
                : { status: 500, message: verifyResult.error };
        } catch (error) {
            console.error("❌ Failed to verify domain:", error);
            return {
                status: 500,
                message: `Houston, we have a problem: ${error.message}`,
            };
        }
    },

    /**
     * Performs batch verification of multiple domains with rate limiting
     * @async
     * @memberof check
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
    async batch(options = {}) {
        const {
            limit = 20,
            delayBetweenDomains = CONFIG.DELAY_BETWEEN_DOMAINS,
            batchSize = CONFIG.BATCH_SIZE,
        } = options;

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

            const domainsToProcess = domainsToCheck.slice(0, limit);
            const results = await verificationEngine.verifyBatch(
                domainsToProcess,
                { delayBetweenDomains, batchSize }
            );

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
            console.error(
                "❌ Failed to perform batch domain verification:",
                error
            );
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
