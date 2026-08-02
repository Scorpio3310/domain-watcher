/**
 * @fileoverview Shared utilities and services for domain management operations.
 * Provides common validation, verification engine, and utility functions used
 * across domain-related services and remote functions.
 * @module DomainUtils
 */

import { executeSql, executeQueryFirst } from "$src/lib/database/db";
import { DOMAIN_QUERIES } from "$src/lib/database/domain-queries";
import * as domainLookup from "$src/lib/server/services/domain-lookup";
import { getErrorMessage } from "$src/lib/utils/helpers";
import { apiKey } from "$src/lib/server/infrastructure/api-key.js";
import { DOMAIN_STATUS, DOMAIN_PROVIDER } from "$lib/constants/constants";
import { validateDemoMode } from "$src/lib/server/utils/access";

export { validateDemoMode };

/** @import { DomainRecord, ValidationError, VerificationResult, BatchOptions, BatchVerificationResult, LookupContext } from "$lib/types" */

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
 * Checks demo mode restrictions and that the effective lookup provider is
 * usable (RDAP needs nothing; WhoisJSON needs a configured API key).
 *
 * @async
 * @function validateAccess
 * @memberof module:DomainUtils
 * @returns {Promise<ValidationError|null>} Error object if access denied, null if access granted
 * @throws {Error} When provider resolution fails unexpectedly
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
    const demoError = validateDemoMode();
    if (demoError) return demoError;
    const context = await domainLookup.resolveLookupContext();
    if (context.provider === DOMAIN_PROVIDER.RDAP) return null;
    if (!context.whoisKeyConfigured)
        return {
            status: 400,
            message:
                "No API key, no party 🎉 Drop a WhoisJSON key in Settings — or switch the lookup provider to RDAP (free)",
        };
    return null;
};

/**
 * Validates access to SSL certificate checks, which run via WhoisJSON
 * regardless of the selected lookup provider.
 *
 * @async
 * @function validateSslAccess
 * @memberof module:DomainUtils
 * @returns {Promise<ValidationError|null>} Error object if access denied, null if access granted
 */
export const validateSslAccess = async () => {
    const demoError = validateDemoMode();
    if (demoError) return demoError;
    if (!(await apiKey.isConfigured()))
        return {
            status: 400,
            message:
                "SSL checks run via WhoisJSON — add an API key in Settings first",
        };
    return null;
};

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
    return /** @type {DomainRecord|null} */ (domain || null);
};

/**
 * Executes a domain-related database query and returns success status.
 * Provides a standardized way to execute domain queries and check if they affected any rows.
 *
 * @async
 * @function executeDomainQuery
 * @memberof module:DomainUtils
 * @param {keyof typeof DOMAIN_QUERIES} queryKey - Key from DOMAIN_QUERIES object
 * @param {Array<any>} params - Parameters for the SQL query
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
    return (result.meta?.changes ?? 0) > 0;
};

// ========================================
// DOMAIN VERIFICATION ENGINE
// ========================================

/** Backoff delays (ms) between DB write attempts on the verification path */
const DB_RETRY_DELAYS_MS = [200, 500];

/**
 * Runs a DB operation with bounded retries to ride out transient D1 failures
 * ("D1 DB storage operation exceeded timeout ..."). Retries on ANY throw —
 * retrying a deterministic SQL error twice is harmless, while sniffing D1
 * message strings would be brittle.
 * @template T
 * @param {() => Promise<T>} operation - DB operation to execute
 * @returns {Promise<T>} Result of the first successful attempt
 * @throws {Error} The final attempt's error when all retries are exhausted
 */
const withDbRetry = async (operation) => {
    for (let attempt = 0; ; attempt++) {
        try {
            return await operation();
        } catch (error) {
            if (attempt >= DB_RETRY_DELAYS_MS.length) throw error;
            console.warn(
                `⚠️ DB write failed (${getErrorMessage(error)}), retry ${
                    attempt + 1
                }/${DB_RETRY_DELAYS_MS.length}...`
            );
            await new Promise((resolve) =>
                setTimeout(resolve, DB_RETRY_DELAYS_MS[attempt])
            );
        }
    }
};

/**
 * Persists a failed check without destroying known domain state.
 * Domains with a definitive status (available/registered) keep it — the
 * failure lands in error_message only, so a transient provider or DB hiccup
 * can't knock an available domain out of the daily report. Domains that never
 * had a definitive answer (not_checked/error) become 'error'.
 * Best-effort: its own DB errors are logged, never rethrown.
 * @param {DomainRecord} domain - Domain whose check failed (pre-check row)
 * @param {string} errorMessage - Failure reason to store
 * @returns {Promise<void>} Resolves once bookkeeping is done (or abandoned)
 */
const recordCheckFailure = async (domain, errorMessage) => {
    const hasKnownStatus =
        domain.status === DOMAIN_STATUS.AVAILABLE ||
        domain.status === DOMAIN_STATUS.REGISTERED;
    const queryKey = hasKnownStatus
        ? "UPDATE_DOMAIN_CHECK_FAILED"
        : "UPDATE_DOMAIN_ERROR";
    try {
        await withDbRetry(() =>
            executeSql(DOMAIN_QUERIES[queryKey], [errorMessage, domain.id])
        );
    } catch (dbError) {
        console.error(
            `❌ Failed to record check failure for ${domain.domain_name}:`,
            dbError
        );
    }
};

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
     * Verifies the availability status of a single domain through the
     * configured lookup provider (RDAP or WhoisJSON).
     * Only a definitive lookup answer updates the stored status; failed checks
     * on domains with a known status (available/registered) preserve that
     * state and are recorded in error_message via recordCheckFailure. If the
     * lookup succeeded but the status write keeps failing, the outer catch
     * records the failure and the OLD state stands (next run repairs it).
     *
     * @async
     * @memberof module:DomainUtils.verificationEngine
     * @param {DomainRecord} domain - Domain object from database
     * @param {LookupContext|null} [lookupContext=null] - Pre-resolved provider context (batch path)
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
    async verifyDomain(domain, lookupContext = null) {
        try {
            console.log(`🔍 Checking ${domain.domain_name}...`);

            const result = await domainLookup.checkDomainAvailability(
                domain.domain_name,
                lookupContext
            );

            if (result.status === 200 && result.data) {
                // ALWAYS save full domain data - not just availability
                await withDbRetry(() =>
                    executeSql(DOMAIN_QUERIES.UPDATE_DOMAIN, [
                        result.data.status || DOMAIN_STATUS.ERROR,
                        result.data.expires || null,
                        JSON.stringify(result.data),
                        domain.id,
                    ])
                );

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
                    source: result.data.source,
                };
            } else {
                const errorMessage = getErrorMessage(result, "Unknown error");
                await recordCheckFailure(domain, errorMessage);

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
            const errorMessage = getErrorMessage(error, "Unknown error");
            await recordCheckFailure(domain, errorMessage);

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
                failures: [],
                sources: { rdap: 0, whoisjson: 0 },
            };
        }

        console.log(
            `📊 Verifying ${domains.length} domains (delay: ${delayBetweenDomains}ms, batch: ${batchSize})...`
        );

        // Resolve the provider once per batch instead of per domain
        const lookupContext = await domainLookup.resolveLookupContext();

        /** @type {BatchVerificationResult} */
        const results = {
            checked: 0,
            available: [],
            stillRegistered: [],
            errors: 0,
            errorMessages: [],
            failures: [],
            sources: { rdap: 0, whoisjson: 0 },
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
                return this.verifyDomain(domain, lookupContext);
            });

            const batchResults = await Promise.allSettled(batchPromises);

            // Collect results using allSettled pattern
            batchResults.forEach((settledResult, index) => {
                if (settledResult.status === "fulfilled") {
                    const verifyResult = settledResult.value;

                    if (verifyResult.success) {
                        if (verifyResult.source === DOMAIN_PROVIDER.RDAP) {
                            results.sources.rdap++;
                        } else if (
                            verifyResult.source === DOMAIN_PROVIDER.WHOIS_JSON
                        ) {
                            results.sources.whoisjson++;
                        }

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
                        results.failures.push({
                            domain_name: verifyResult.domain,
                            error: verifyResult.error ?? "Unknown error",
                        });
                    }
                } else {
                    // Handle promise rejection
                    const domainName = batch[index]?.domain_name || "unknown";
                    results.errors++;
                    results.errorMessages.push(
                        `${domainName}: Promise rejected - ${settledResult.reason}`
                    );
                    results.failures.push({
                        domain_name: domainName,
                        error: getErrorMessage(settledResult.reason),
                    });
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
