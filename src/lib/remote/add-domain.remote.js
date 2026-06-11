/**
 * @fileoverview Remote function for adding a domain to the watchlist.
 * @module AddDomainRemote
 */

/** @import { ServiceResult } from '$lib/types' */

import { form } from "$app/server";
import { addDomainSchema } from "$src/routes/validation";
import { domains } from "$src/lib/server/services/domain";
import { getErrorMessage } from "$src/lib/utils/helpers";

/**
 * Adds a new domain to the watchlist.
 * Demo-mode and API-key gating happens inside the domain service; the
 * try/catch is a safety net for unexpected throws.
 *
 * @function addDomain
 * @memberof module:AddDomainRemote
 * @returns {Promise<ServiceResult>} Response object with add result
 */
export const addDomain = form(addDomainSchema, async ({ domainName }) => {
    try {
        const result = /** @type {ServiceResult} */ (
            await domains.add(domainName)
        );

        return {
            status: result.status,
            message: result.message,
        };
    } catch (error) {
        console.error("❌ Failed to add domain:", error);
        return {
            status: 500,
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
        };
    }
});
