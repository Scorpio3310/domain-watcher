/**
 * @fileoverview Domain card remote functions for individual domain operations.
 * Provides SSL, NS lookup, domain verification, and domain removal functionality
 * for single domains through SvelteKit form actions.
 * @module DomainCardRemote
 */

/** @import { ServiceResult } from '$lib/types' */

import * as whoisService from "$src/lib/server/infrastructure/whois-client";
import { form } from "$app/server";
import { getErrorMessage } from "$src/lib/utils/helpers";
import { domainIdFormSchema } from "$src/routes/validation";
import {
    validateAccess,
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
 * @returns {Promise<ServiceResult>} Response object with NS lookup results
 * @throws {Error} Database or network connectivity errors
 */
export const ns = form(domainIdFormSchema, async ({ domainId }) => {
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
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
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
 * @returns {Promise<ServiceResult>} Response object with SSL certificate information
 * @throws {Error} Database or network connectivity errors
 */
export const ssl = form(domainIdFormSchema, async ({ domainId }) => {
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
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
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
 * @returns {Promise<ServiceResult>} Response object with verification results
 * @throws {Error} Database or network connectivity errors
 */
export const check = form(domainIdFormSchema, async ({ domainId }) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    try {
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
            : { status: 500, message: verifyResult.error ?? "Unknown error" };
    } catch (error) {
        console.error("❌ Failed to verify domain:", error);
        return {
            status: 500,
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
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
 * @returns {Promise<ServiceResult>} Response object with removal status
 * @throws {Error} Database connectivity errors
 */
export const remove = form(domainIdFormSchema, async ({ domainId }) => {
    const accessError = await validateAccess();
    if (accessError) return accessError;

    try {
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
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
        };
    }
});
