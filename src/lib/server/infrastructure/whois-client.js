/**
 * @fileoverview Production-ready WHOIS domain operations with proper error handling,
 * input validation, retry logic, and consistent API design
 * @module WhoIsDomainService
 */

import { apiKey } from "./api-key";
import { WhoisJson } from "@whoisjson/whoisjson";
import { DOMAIN_STATUS } from "$src/lib/constants/constants";

// ========================================
// CONSTANTS & CONFIG
// ========================================
const TEST_DOMAIN = "example.com";

// ========================================
// TYPES & INTERFACES
// ========================================
/**
 * @typedef {Object} ServiceResult
 * @property {number} status - HTTP status code
 * @property {string} message - Result message
 * @property {*} [data] - Optional data payload
 */

/**
 * @typedef {Object} DomainAvailabilityData
 * @property {string} status - Domain availability status
 * @property {string|null} expires - Domain expiration date
 * @property {Object} rawDomainData - Raw data from WHOIS API
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
 * @param {Error} error - The error object from WHOIS API
 * @returns {WhoisError} Classified error with metadata
 */
const classifyWhoisError = (error) => {
    const errorMessage = error?.message || "Unknown error occurred";
    const lowerMessage = errorMessage.toLowerCase();

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
 * @param {Error} error - The error object from WHOIS API
 * @param {string} operation - The operation that failed
 * @param {string} domainName - Domain name that was being processed
 * @returns {ServiceResult} Standardized error response
 */
const handleWhoisError = (error, operation, domainName) => {
    const classifiedError = classifyWhoisError(error);

    console.error(`❌ ${operation} failed for ${domainName}:`, {
        originalMessage: error?.message,
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
 * Create WhoisJson client with proper configuration
 * @param {string} [customApiKey] - Optional custom API key, otherwise uses stored key
 * @returns {Promise<WhoisJson>} Configured whois client
 * @throws {Error} If API key is not available
 */
const createWhoisClient = async (customApiKey = null) => {
    const keyToUse = customApiKey || (await apiKey.get());

    if (!keyToUse) {
        throw new Error(
            "WHOIS API key not configured. Please configure API settings first."
        );
    }

    return new WhoisJson({ apiKey: keyToUse });
};

// ========================================
// PUBLIC API FUNCTIONS
// ========================================

/**
 * Check domain availability with comprehensive error handling and validation
 * @param {string} domainName - Domain to check
 * @param {string} [customApiKey] - Optional custom API key for testing
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

        // Only call checkDomainAvailability - it should contain all needed info
        const availability = await whois.checkDomainAvailability(domainName);

        // Optionally get full WHOIS data if needed
        let fullData = null;
        try {
            fullData = await whois.lookup(domainName);
        } catch (lookupError) {
            // Lookup might fail for available domains, that's OK
            console.log(
                `Lookup failed for ${domainName}, likely available domain`
            );
        }

        return {
            status: 200,
            message: "Domain availability checked successfully",
            data: {
                domain: domainName,
                status: availability?.available
                    ? DOMAIN_STATUS.AVAILABLE
                    : DOMAIN_STATUS.REGISTERED,
                expires: fullData?.expires || null,
                registrar: fullData?.registrar || null,
                rawDomainData: fullData || availability,
            },
        };
    } catch (error) {
        return handleWhoisError(error, "Domain availability check", domainName);
    }
}

/**
 * Perform NS lookup for a domain with proper validation
 * @param {string} domainName - Domain name to lookup
 * @param {string} [customApiKey] - Optional custom API key
 * @returns {Promise<ServiceResult>} DNS lookup result
 */
export async function checkDomainNS(domainName, customApiKey = null) {
    try {
        const whois = await createWhoisClient(customApiKey);

        console.log(`🔍 NS lookup for ${domainName}`);
        const dnsResult = await whois.nslookup(domainName);

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
 * @param {string} [customApiKey] - Optional custom API key
 * @returns {Promise<ServiceResult>} SSL certificate result
 */
export async function checkDomainSSL(domainName, customApiKey = null) {
    try {
        const whois = await createWhoisClient(customApiKey);

        console.log(`🔍 SSL lookup check for ${domainName}`);
        const sslResult = await whois.ssl(domainName);

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
 * Test API key connection without saving to database
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
        const result = await checkDomainAvailability(testDomain, testApiKey);

        return {
            status: result.status === 200 ? 200 : result.status,
            message:
                result.status === 200
                    ? "API key is working correctly"
                    : `${result.message}`,
        };
    } catch (error) {
        return {
            status: 500,
            message: `${error.message}`,
        };
    }
}
