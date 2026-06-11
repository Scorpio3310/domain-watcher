/**
 * @fileoverview Batch domain availability verification remote function.
 * Validates access, delegates domain selection and verification to the
 * domain service, and formats the result for the UI toast.
 * @module CheckDomainsRemote
 */

/** @import { ServiceResult } from '$lib/types' */

import { form } from "$app/server";
import { getErrorMessage } from "$src/lib/utils/helpers";
import { validateAccess } from "$src/lib/server/utils/domain-utils.js";
import { domainVerification } from "$src/lib/server/services/domain.js";

/** Maximum number of individual error messages shown in the toast */
const MAX_SHOWN_ERRORS = 3;

/**
 * Formats the per-provider breakdown for the batch toast
 * @param {{rdap: number, whoisjson: number}} [sources] - Successful checks per provider
 * @returns {string} " (18 via RDAP, 2 via WhoisJSON)", " (all via RDAP)" or ""
 */
const formatSourceNote = (sources) => {
    if (!sources) return "";
    const parts = [];
    if (sources.rdap > 0) parts.push(`${sources.rdap} via RDAP`);
    if (sources.whoisjson > 0) parts.push(`${sources.whoisjson} via WhoisJSON`);
    if (parts.length === 0) return "";
    if (parts.length === 1) {
        return ` (all via ${sources.rdap > 0 ? "RDAP" : "WhoisJSON"})`;
    }
    return ` (${parts.join(", ")})`;
};

// ========================================
// BATCH CHECK REMOTE FUNCTION
// ========================================

/**
 * Performs batch verification of multiple domains with rate limiting.
 * Validates user access, then delegates to the domain service which selects
 * domains needing a check and verifies them in batches.
 *
 * @async
 * @function batchCheck
 * @memberof module:CheckDomainsRemote
 * @returns {Promise<ServiceResult>} Response object with batch verification results
 * (status: 200 success, 204 nothing to check, 207 partial success, 422 mostly failed,
 * 403 demo mode, 400 lookup provider not usable (WhoisJSON selected without a key), 500 error)
 *
 * @example
 * const response = await batchCheck();
 * if (response.status === 200) {
 *     console.log('All domains verified successfully');
 * } else if (response.status === 207) {
 *     console.log(`Partial success: ${response.results.successRate}% success rate`);
 * }
 */
export const batchCheck = form(async () => {
    try {
        const accessError = await validateAccess();
        if (accessError) return accessError;

        const { results, total, processed } =
            await domainVerification.checkDomainsNeedingCheck();

        if (!processed) {
            return {
                status: 204,
                message:
                    "Your domains are all caught up - nothing to do here! 😎",
            };
        }

        const truncatedNote =
            total > processed
                ? ` (checked ${processed} of ${total} — run again for the rest)`
                : "";

        // Simple status
        if (results.errors > 0) {
            const successRate = Math.round(
                ((results.checked - results.errors) / results.checked) * 100
            );
            const shownErrors = results.errorMessages
                .slice(0, MAX_SHOWN_ERRORS)
                .join("; ");
            const moreErrors =
                results.errorMessages.length > MAX_SHOWN_ERRORS
                    ? ` … and ${
                          results.errorMessages.length - MAX_SHOWN_ERRORS
                      } more (see logs)`
                    : "";

            return {
                status: successRate < 50 ? 422 : 207,
                message: `${successRate}% success rate! ${
                    results.checked - results.errors
                }/${
                    results.checked
                } domains cooperated${formatSourceNote(
                    results.sources
                )}, others were stubborn 😅: ${shownErrors}${moreErrors}${truncatedNote}`,
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
                message: `Boom! ${results.checked}/${results.checked} domains checked - 100% success rate! 🎯${formatSourceNote(results.sources)}${truncatedNote}`,
            };
        }
    } catch (error) {
        console.error("❌ Failed to perform batch domain verification:", error);
        return {
            status: 500,
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
        };
    }
});
