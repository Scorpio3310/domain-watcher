/**
 * @fileoverview Remote function for adding a domain to the watchlist.
 * @module AddDomainRemote
 */

/** @import { ServiceResult } from '#lib/types.js' */

import { form } from "$app/server";
import { invalid, isValidationError } from "@sveltejs/kit";
import { addDomainSchema } from "#src/routes/validation.js";
import { domains } from "#lib/server/services/domain.js";
import { getErrorMessage } from "#lib/utils/helpers.js";
import { getRegistrableDomainIssue } from "#lib/server/utils/domain-name.js";

/**
 * Adds a new domain to the watchlist.
 * Names that aren't registrable domains, and domains already on the
 * watchlist, come back as inline issues on the domainName field.
 * Demo-mode and API-key gating happens inside the domain service; the
 * try/catch is a safety net for unexpected throws.
 *
 * @function addDomain
 * @memberof module:AddDomainRemote
 * @returns {Promise<ServiceResult>} Response object with add result
 */
export const addDomain = form(addDomainSchema, async ({ domainName }, issue) => {
    try {
        const registrableIssue = getRegistrableDomainIssue(domainName);
        if (registrableIssue) {
            invalid(issue.domainName(registrableIssue));
        }

        const result = /** @type {ServiceResult} */ (
            await domains.add(domainName)
        );

        // Already watched → show it on the field, like other input problems
        if (result.status === 409) {
            invalid(issue.domainName(result.message));
        }

        return {
            status: result.status,
            message: result.message,
        };
    } catch (error) {
        // invalid() throws - let SvelteKit turn it into field issues
        if (isValidationError(error)) throw error;

        console.error("❌ Failed to add domain:", error);
        return {
            status: 500,
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
        };
    }
});
