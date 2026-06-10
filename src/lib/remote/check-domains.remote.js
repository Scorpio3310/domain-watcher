/**
 * @fileoverview Domain management service for monitoring domain availability,
 * SSL certificates, and nameserver records. Provides batch verification
 * capabilities with rate limiting and error handling.
 * @module CheckDomainsRemote
 */

/** @import { DomainRecord, ServiceResult } from '$lib/types' */

import { executeSql } from "$src/lib/database/db";
import { DOMAIN_QUERIES } from "$src/lib/database/domain-queries";
import { getErrorMessage } from "$src/lib/utils/helpers";
import { form } from "$app/server";
import {
    validateAccess,
    verificationEngine,
    CONFIG,
} from "$src/lib/server/utils/domain-utils.js";

// ========================================
// BATCH CHECK REMOTE FUNCTION
// ========================================

/**
 * Performs batch verification of multiple domains with rate limiting.
 * Validates user access, selects domains needing a check, and verifies them
 * in batches via the shared verification engine.
 *
 * @async
 * @function batchCheck
 * @memberof module:CheckDomainsRemote
 * @returns {Promise<ServiceResult>} Response object with batch verification results
 * (status: 200 success, 204 nothing to check, 207 partial success, 422 mostly failed,
 * 403 demo mode, 400 missing API key, 500 error)
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

        const queryResult = await executeSql(
            DOMAIN_QUERIES.SELECT_DOMAINS_NEEDING_CHECK
        );
        const domainsToCheck = /** @type {DomainRecord[]} */ (
            queryResult?.results || []
        );

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
            message: `Houston, we have a problem: ${getErrorMessage(error)}`,
        };
    }
});
