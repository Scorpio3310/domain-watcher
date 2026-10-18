/**
 * @fileoverview Production-ready WHOIS domain operations with proper error handling,
 * input validation, retry logic, and consistent API design
 * @module WhoIsDomainService
 */

/** @import { ServiceResult } from '#lib/types.js' */

import { apiKey } from "./api-key";
import { createWhoisJsonApi } from "./whoisjson-api.js";
import { DOMAIN_STATUS } from "#lib/constants/constants.js";
import { getErrorMessage } from "#lib/utils/helpers.js";

// ========================================
// CONSTANTS & CONFIG
// ========================================
const TEST_DOMAIN = "example.com";
/** Per-call cap (the API client also aborts the request itself after 10s) */
const WHOIS_TIMEOUT_MS = 10_000;

// ========================================
// TYPES & INTERFACES
// ========================================
/**
 * @typedef {Object} DomainAvailabilityData
 * @property {string} domain - The domain name that was checked
 * @property {string} status - Domain availability status
 * @property {string|null} expires - Domain expiration date
 * @property {{name: string, url?: string|null}|null} registrar - Registrar info
 * @property {Record<string, any>} rawDomainData - Raw data from WHOIS API
 * @property {'whoisjson'} source - Provider tag (see DomainLookupData in #lib/types)
 */

/**
 * @typedef {Object} WhoisError
 * @property {string} message - Error message
 * @property {number} status - HTTP status code
 */

// ========================================
// ERROR HANDLING
// ========================================
/**
 * Classifies WHOIS API errors into structured error types
 * @param {unknown} error - The error value from WHOIS API
 * @returns {WhoisError} Classified error with metadata
 */
const classifyWhoisError = (error) => {
    const errorMessage = getErrorMessage(error, "Unknown error occurred");
    const lowerMessage = errorMessage.toLowerCase();

    // HTTP status from the WhoisJSON API client wins over message heuristics
    const httpStatus =
        error && typeof error === "object" && "status" in error
            ? Number(/** @type {{status: unknown}} */ (error).status)
            : NaN;
    if (httpStatus === 401 || httpStatus === 403) {
        return { message: errorMessage, status: 401 };
    }
    if (httpStatus === 429) {
        return { message: errorMessage, status: 429 };
    }
    if (httpStatus >= 500) {
        return { message: errorMessage, status: 502 };
    }

    // Network/Connection errors
    if (
        lowerMessage.includes("network") ||
        lowerMessage.includes("timeout") ||
        lowerMessage.includes("connection") ||
        lowerMessage.includes("ssl connection failed")
    ) {
        return {
            message: errorMessage,
            status: 502,
        };
    }

    // Authentication errors
    if (
        lowerMessage.includes("api key") ||
        lowerMessage.includes("authentication") ||
        lowerMessage.includes("unauthorized")
    ) {
        return {
            message: errorMessage,
            status: 401,
        };
    }

    // Rate limiting
    if (
        lowerMessage.includes("rate limit") ||
        lowerMessage.includes("too many requests")
    ) {
        return {
            message: errorMessage,
            status: 429,
        };
    }

    // Validation errors
    if (
        lowerMessage.includes("domain name parameter") ||
        lowerMessage.includes("invalid domain") ||
        lowerMessage.includes("parameter has not been filled") ||
        lowerMessage.includes("not found")
    ) {
        return {
            message: errorMessage,
            status: 400,
        };
    }

    // Server errors (default)
    return {
        message: errorMessage,
        status: 500,
    };
};

/**
 * Handles WHOIS operation errors with structured logging and response
 * @param {unknown} error - The error value from WHOIS API
 * @param {string} operation - The operation that failed
 * @param {string} domainName - Domain name that was being processed
 * @returns {ServiceResult} Standardized error response
 */
const handleWhoisError = (error, operation, domainName) => {
    const classifiedError = classifyWhoisError(error);

    console.error(`❌ ${operation} failed for ${domainName}:`, {
        originalMessage: getErrorMessage(error),
        domain: domainName,
    });

    return {
        status: classifiedError.status,
        message: classifiedError.message,
    };
};

// ========================================
// WHOIS CLIENT MANAGEMENT
// ========================================

/**
 * Create WhoisJSON API client with proper configuration
 * @param {string|null} [customApiKey] - Optional custom API key, otherwise uses stored key
 * @returns {Promise<ReturnType<typeof createWhoisJsonApi>>} Configured whois client
 * @throws {Error} If API key is not available
 */
const createWhoisClient = async (customApiKey = null) => {
    const keyToUse = customApiKey || (await apiKey.get());

    if (!keyToUse) {
        throw new Error(
            "WHOIS API key not configured. Please configure API settings first."
        );
    }

    return createWhoisJsonApi(keyToUse);
};

/**
 * Races a WhoisJSON API call against WHOIS_TIMEOUT_MS so one stalled
 * connection can't hold a whole verification batch. The rejection message
 * contains "timeout", which classifyWhoisError maps to 502.
 * @template T
 * @param {Promise<T>} call - Pending API call
 * @param {string} operation - Operation label used in the timeout message
 * @returns {Promise<T>} The API result, or a rejection after the timeout
 */
const withTimeout = (call, operation) => {
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timer;
    const timeout = /** @type {Promise<never>} */ (
        new Promise((_, reject) => {
            timer = setTimeout(
                () =>
                    reject(
                        new Error(
                            `WhoisJSON ${operation} timeout after ${WHOIS_TIMEOUT_MS}ms`
                        )
                    ),
                WHOIS_TIMEOUT_MS
            );
        })
    );
    return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
};

/**
 * Whether a successful /whois payload is usable for a domain the availability
 * endpoint reported as registered: it must be an object that doesn't contradict
 * that answer (registered !== false) and either confirms it explicitly
 * (registered === true - some ccTLDs publish almost no WHOIS data) or carries
 * at least one real WHOIS field. Throttled WHOIS servers can come back as a 200
 * with empty fields, and storing that would wipe the known expiry.
 * @param {unknown} data - Raw lookup() result
 * @returns {boolean} True when the payload can be stored
 */
const isUsableWhoisData = (data) => {
    if (!data || typeof data !== "object") return false;

    const whois = /** @type {Partial<import("./whoisjson-api.js").WhoisResponse>} */ (
        data
    );
    if (whois.registered === false) return false;
    if (whois.registered === true) return true;

    return Boolean(
        whois.expires ||
            whois.registrar?.name ||
            whois.created ||
            whois.changed ||
            whois.status?.length ||
            whois.nameserver?.length
    );
};

// ========================================
// PUBLIC API FUNCTIONS
// ========================================

/**
 * Check domain availability with comprehensive error handling and validation.
 * Available domains cost ONE API call (/domain-availability); registered
 * domains also call /whois for expiry + registrar. Only a definitive answer
 * returns 200 — a non-boolean availability flag (502), a failed /whois
 * lookup on a registered domain, or a /whois 200 with an unusable body (not
 * an object, registered === false, or no WHOIS fields; 502) returns an error,
 * so verifyDomain records a failure and keeps the last known status/expiry
 * instead of storing "registered, no expiry".
 * @param {string} domainName - Domain to check
 * @param {string|null} [customApiKey] - Optional custom API key for testing
 * @returns {Promise<ServiceResult>} Domain availability result
 *
 * @example
 * const result = await checkDomainAvailability('example.com');
 * if (result.status === 200) {
 *   console.log('Domain status:', result.data.status);
 * }
 */
export async function checkDomainAvailability(domainName, customApiKey = null) {
    try {
        const whois = await createWhoisClient(customApiKey);

        console.log(`🔍 Domain availability check for ${domainName}`);

        const availability = await withTimeout(
            whois.checkDomainAvailability(domainName),
            "availability check"
        );

        // Anything but a boolean is not a definitive answer — never guess
        if (typeof availability?.available !== "boolean") {
            console.error(
                `❌ Unexpected WhoisJSON availability response for ${domainName}:`,
                availability
            );
            return {
                status: 502,
                message: `WhoisJSON returned an unexpected availability response for ${domainName}`,
            };
        }

        if (availability.available) {
            return {
                status: 200,
                message: "Domain availability checked successfully",
                data: {
                    domain: domainName,
                    status: DOMAIN_STATUS.AVAILABLE,
                    expires: null,
                    registrar: null,
                    rawDomainData: availability,
                    source: "whoisjson",
                },
            };
        }

        // Registered → full WHOIS data supplies expiry + registrar. A failed
        // lookup (429, 5xx, timeout) must surface as an error, not as
        // "registered with no expiry" that would wipe the stored date.
        let fullData;
        try {
            fullData = await withTimeout(
                whois.lookup(domainName),
                "WHOIS lookup"
            );
        } catch (lookupError) {
            return handleWhoisError(lookupError, "WHOIS lookup", domainName);
        }

        // A 200 with an unusable body is a failed lookup too — keep the
        // stored expiry instead of overwriting it with null
        if (!isUsableWhoisData(fullData)) {
            console.error(
                `❌ Unusable WhoisJSON WHOIS response for ${domainName}:`,
                fullData
            );
            return {
                status: 502,
                message: `WhoisJSON returned an unusable WHOIS response for ${domainName}`,
            };
        }

        return {
            status: 200,
            message: "Domain availability checked successfully",
            data: {
                domain: domainName,
                status: DOMAIN_STATUS.REGISTERED,
                expires: fullData?.expires || null,
                registrar: fullData?.registrar || null,
                rawDomainData: fullData || availability,
                source: "whoisjson",
            },
        };
    } catch (error) {
        return handleWhoisError(error, "Domain availability check", domainName);
    }
}

/**
 * Perform NS lookup for a domain with proper validation
 * @param {string} domainName - Domain name to lookup
 * @param {string|null} [customApiKey] - Optional custom API key
 * @returns {Promise<ServiceResult>} DNS lookup result
 */
export async function checkDomainNS(domainName, customApiKey = null) {
    try {
        const whois = await createWhoisClient(customApiKey);

        console.log(`🔍 NS lookup for ${domainName}`);
        const dnsResult = await withTimeout(
            whois.nslookup(domainName),
            "NS lookup"
        );

        return {
            status: 200,
            message: "NS lookup completed successfully",
            data: {
                domain: domainName,
                rawDomainData: dnsResult,
            },
        };
    } catch (error) {
        return handleWhoisError(error, "DNS lookup", domainName);
    }
}

/**
 * Get SSL certificate information for a domain
 * @param {string} domainName - Domain name to check SSL certificate
 * @param {string|null} [customApiKey] - Optional custom API key
 * @returns {Promise<ServiceResult>} SSL certificate result
 */
export async function checkDomainSSL(domainName, customApiKey = null) {
    try {
        const whois = await createWhoisClient(customApiKey);

        console.log(`🔍 SSL lookup check for ${domainName}`);
        const sslResult = await withTimeout(
            whois.ssl(domainName),
            "SSL lookup"
        );

        return {
            status: 200,
            message: "SSL lookup information retrieved successfully",
            data: {
                domain: domainName,
                rawDomainData: sslResult,
            },
        };
    } catch (error) {
        return handleWhoisError(error, "SSL certificate check", domainName);
    }
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Test API key connection without saving to database.
 * Makes ONE authenticated /domain-availability call (with the per-call
 * timeout) — /whois is not involved, so a flaky WHOIS lookup can't mark a
 * valid key as invalid, and a key save costs a single quota call.
 * @param {string} testApiKey - API key to test
 * @param {string} [testDomain="example.com"] - Domain to test with
 * @returns {Promise<ServiceResult>} Test result
 *
 * @example
 * const testResult = await testApiKeyConnection('your-api-key');
 * console.log('API key valid:', testResult.status === 200);
 */
export async function testApiKeyConnection(
    testApiKey,
    testDomain = TEST_DOMAIN
) {
    if (!testApiKey || typeof testApiKey !== "string") {
        return {
            status: 400,
            message: "API key is required for testing",
        };
    }

    try {
        const whois = await createWhoisClient(testApiKey);

        console.log(`🔑 Testing WhoisJSON API key against ${testDomain}`);

        const availability = await withTimeout(
            whois.checkDomainAvailability(testDomain),
            "availability check"
        );

        if (typeof availability?.available !== "boolean") {
            console.error(
                "❌ Unexpected WhoisJSON availability response while testing the API key:",
                availability
            );
            return {
                status: 502,
                message:
                    "WhoisJSON returned an unexpected response while testing the API key",
            };
        }

        return {
            status: 200,
            message: "API key is working correctly",
        };
    } catch (error) {
        return handleWhoisError(error, "API key test", testDomain);
    }
}
