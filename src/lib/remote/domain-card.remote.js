/**
 * @fileoverview Domain card remote functions for individual domain operations.
 * Provides SSL, NS lookup, domain verification, and domain removal functionality
 * for single domains through SvelteKit form actions.
 * @module DomainCardRemote
 */

import * as whoisService from "$src/lib/server/infrastructure/whois-client";
import { form } from "$app/server";
import { domainIdSchema } from "$src/routes/validation";
import {
    validateAccess,
    validateDemoMode,
    findDomainById,
    executeDomainQuery,
    verificationEngine,
} from "$src/lib/server/utils/domain-utils.js";

// ========================================
// DOMAIN CARD REMOTE FUNCTIONS
// ========================================

/**
 * Performs nameserver (NS) lookup for a specific domain.
 * Validates user access, retrieves domain information, and updates the database
 * with current nameserver records.
 *
 * @async
 * @function ns
 * @memberof module:DomainCardRemote
 * @param {FormData} data - Form data containing domainId
 * @returns {Promise<ServiceResponse>} Response object with NS lookup results
 * @throws {Error} Database or network connectivity errors
 *
 * @example
 * ```javascript
 * // In a SvelteKit form action
 * export const actions = {
 *   ns: async ({ request }) => {
 *     const data = await request.formData();
 *     return await ns(data);
 *   }
 * };
 * ```
 *
 */
export const ns = form(async (data) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    const domainId = data.get("domainId");

    const validateRes = domainIdSchema.safeParse(domainId);

    if (!validateRes.success) {
        return {
            status: 400,
            message: validateRes.error.issues.map((i) => i.message),
        };
    }

    const validDomainId = validateRes.data;

    const domain = await findDomainById(validDomainId);
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
            validDomainId,
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
 * Performs SSL certificate check for a specific domain.
 * Validates user access, retrieves domain information, and updates the database
 * with current SSL certificate information including expiration dates.
 *
 * @async
 * @function ssl
 * @memberof module:DomainCardRemote
 * @param {FormData} data - Form data containing domainId
 * @returns {Promise<ServiceResponse>} Response object with SSL certificate information
 * @throws {Error} Database or network connectivity errors
 *
 * @example
 * ```javascript
 * // In a SvelteKit form action
 * export const actions = {
 *   ssl: async ({ request }) => {
 *     const data = await request.formData();
 *     return await ssl(data);
 *   }
 * };
 * ```
 *
 */
export const ssl = form(async (data) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    const domainId = data.get("domainId");

    const validateRes = domainIdSchema.safeParse(domainId);

    if (!validateRes.success) {
        return {
            status: 400,
            message: validateRes.error.issues.map((i) => i.message),
        };
    }

    const validDomainId = validateRes.data;

    const domain = await findDomainById(validDomainId);
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
            validDomainId,
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
 * Verifies the availability status of a single domain.
 * Performs comprehensive domain verification including WHOIS lookup,
 * status updates, and availability change detection.
 *
 * @async
 * @function check
 * @memberof module:DomainCardRemote
 * @param {FormData} data - Form data containing domainId
 * @returns {Promise<ServiceResponse>} Response object with verification results
 * @throws {Error} Database or network connectivity errors
 *
 * @example
 * ```javascript
 * // In a SvelteKit form action
 * export const actions = {
 *   check: async ({ request }) => {
 *     const data = await request.formData();
 *     return await check(data);
 *   }
 * };
 * ```
 *
 */
export const check = form(async (data) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    const domainId = data.get("domainId");

    const validateRes = domainIdSchema.safeParse(domainId);

    if (!validateRes.success) {
        return {
            status: 400,
            message: validateRes.error.issues.map((i) => i.message),
        };
    }

    const validDomainId = validateRes.data;

    try {
        const accessError = await validateAccess();
        if (accessError) return accessError;

        const domain = await findDomainById(validDomainId);
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
 * Removes a domain from the watchlist.
 * Validates demo mode restrictions, locates the domain, and permanently
 * removes it from the database.
 *
 * @async
 * @function remove
 * @memberof module:DomainCardRemote
 * @param {FormData} data - Form data containing domainId
 * @returns {Promise<ServiceResponse>} Response object with removal status
 * @throws {Error} Database connectivity errors
 *
 * @example
 * ```javascript
 * // In a SvelteKit form action
 * export const actions = {
 *   remove: async ({ request }) => {
 *     const data = await request.formData();
 *     return await remove(data);
 *   }
 * };
 * ```
 *
 */
export const remove = form(async (data) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    const domainId = data.get("domainId");

    const validateRes = domainIdSchema.safeParse(domainId);

    if (!validateRes.success) {
        return {
            status: 400,
            message: validateRes.error.issues.map((i) => i.message),
        };
    }

    const validDomainId = validateRes.data;

    try {
        const demoError = validateDemoMode();
        if (demoError) return demoError;

        const domain = await findDomainById(validDomainId);
        if (!domain)
            return {
                status: 404,
                message:
                    "Hmm, can't find that domain anywhere - maybe it escaped already? 🤔",
            };

        const wasRemoved = await executeDomainQuery("DELETE_DOMAIN", [
            validDomainId,
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

// ========================================
// TYPE DEFINITIONS FOR JSDOC
// ========================================

/**
 * @typedef {Object} ServiceResponse
 * @property {number} status - HTTP status code
 * @property {string} message - Human-readable status message
 * @property {Object} [data] - Optional response data
 * @memberof module:DomainCardRemote
 */
