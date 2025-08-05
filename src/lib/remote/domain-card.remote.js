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
import { form } from "$app/server";
import { domainIdSchema } from "$src/routes/validation";

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

/**
 * Parses a Zod validation error and formats its issues into human-readable messages.
 *
 * @param {import("zod").ZodError} error - The ZodError containing validation issues.
 * @returns {string[]} An array of formatted error messages, each in the form "<field>: <message>".
 */
const createZodErrors = (error) => {
    const messages = JSON.parse(error.message);
    return messages.map((message) => `${message.path[0]}: ${message.message}`);
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
};

// ========================================
// DOMAIN CARD SERVICE
// ========================================

/**
 * Performs nameserver (NS) lookup for a specific domain
 * @async
 * @memberof domain
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
export const ns = form(async (data) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    const domainId = data.get("domainId");

    const validateRes = domainIdSchema.safeParse({
        domainId: parseInt(domainId, 10),
    });

    if (!validateRes.success) {
        return { status: 400, message: createZodErrors(validateRes.error) };
    }

    const domain = await findDomainById(domainId);
    if (!domain)
        return {
            status: 404,
            message:
                "Hmm, can't find that domain anywhere - maybe it escaped already? 🤔",
        };

    try {
        const apiResult = await whoisService.checkDomainNS(domain.domain_name);

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
});

/**
 * Performs SSL certificate check for a specific domain
 * @async
 * @memberof domain
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
export const ssl = form(async (data) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    const domainId = data.get("domainId");

    const validateRes = domainIdSchema.safeParse({
        domainId: parseInt(domainId, 10),
    });

    if (!validateRes.success) {
        return { status: 400, message: createZodErrors(validateRes.error) };
    }

    const domain = await findDomainById(domainId);
    if (!domain)
        return {
            status: 404,
            message:
                "Hmm, can't find that domain anywhere - maybe it escaped already? 🤔",
        };

    try {
        const apiResult = await whoisService.checkDomainSSL(domain.domain_name);

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
});

/**
 * Verifies the availability status of a single domain
 * @async
 * @memberof domain
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
export const check = form(async (data) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    const domainId = data.get("domainId");

    const validateRes = domainIdSchema.safeParse({
        domainId: parseInt(domainId, 10),
    });

    if (!validateRes.success) {
        return { status: 400, message: createZodErrors(validateRes.error) };
    }

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
});

/**
 * Removes a domain from the watchlist
 * @async
 * @memberof domain
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
export const remove = form(async (data) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    const domainId = data.get("domainId");

    const validateRes = domainIdSchema.safeParse({
        domainId: parseInt(domainId, 10),
    });

    if (!validateRes.success) {
        return { status: 400, message: createZodErrors(validateRes.error) };
    }

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
});
