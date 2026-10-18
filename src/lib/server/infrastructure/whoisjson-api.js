/**
 * @fileoverview Minimal WhoisJSON REST client built on fetch.
 * Replaces the @whoisjson/whoisjson SDK: its axios fetch adapter sends
 * `cache: "default"`, which the Cloudflare Workers runtime rejects
 * ("Unsupported cache mode: default"), so every call failed in production.
 * Same endpoints, auth header and error message format as the SDK.
 * Dependency-free on purpose (no $app imports), so it runs in any runtime.
 * @module WhoisJsonApi
 * @see https://whoisjson.com/documentation
 */

const BASE_URL = "https://whoisjson.com/api/v1";

/** Abort a request that hangs longer than this (ms) */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * WHOIS lookup response (fields used by the app; the API returns more)
 * @typedef {Object} WhoisResponse
 * @property {string} [name] - Domain name
 * @property {boolean} [registered] - Whether the domain is registered
 * @property {string[]} [status] - EPP status codes
 * @property {string[]} [nameserver] - Nameservers
 * @property {string} [created] - Creation date
 * @property {string} [changed] - Last change date
 * @property {string} [expires] - Expiration date
 * @property {{name?: string, url?: string}} [registrar] - Registrar
 */

/**
 * Domain availability response
 * @typedef {Object} DomainAvailabilityResponse
 * @property {string} domain - Domain name
 * @property {boolean} available - Whether the domain can be registered
 */

/**
 * Error thrown for failed WhoisJSON requests. The message keeps the SDK's
 * "WhoisJson API Error: ..." format; `status` is the HTTP status (0 when the
 * request never got a response, e.g. network error or timeout).
 */
export class WhoisJsonApiError extends Error {
    /**
     * @param {string} message - Error message
     * @param {number} status - HTTP status, or 0 without a response
     */
    constructor(message, status) {
        super(message);
        this.name = "WhoisJsonApiError";
        this.status = status;
    }
}

/**
 * Fallback message for an error response without a JSON `message`
 * (phrased so classifyWhoisError in whois-client.js recognises it)
 * @param {number} status - HTTP status code
 * @returns {string} Human-readable reason
 */
const describeStatus = (status) => {
    if (status === 401 || status === 403) return "Unauthorized - invalid API key";
    if (status === 429) return "Too many requests - rate limit reached";
    return `Request failed with status code ${status}`;
};

/**
 * Creates a WhoisJSON client for one API key
 * @param {string} apiKey - WhoisJSON API key
 * @returns {{
 *   lookup: (domain: string) => Promise<WhoisResponse>,
 *   checkDomainAvailability: (domain: string) => Promise<DomainAvailabilityResponse>,
 *   nslookup: (domain: string) => Promise<Record<string, any>>,
 *   ssl: (domain: string) => Promise<Record<string, any>>
 * }} Client with one method per API endpoint
 *
 * @example
 * const whois = createWhoisJsonApi(key);
 * const { available } = await whois.checkDomainAvailability("example.com");
 */
export const createWhoisJsonApi = (apiKey) => {
    /**
     * GET an endpoint with the domain as query parameter
     * @param {string} path - Endpoint path, e.g. "/whois"
     * @param {string} domain - Domain name
     * @returns {Promise<any>} Parsed JSON response
     * @throws {WhoisJsonApiError} On network errors, timeouts and non-2xx responses
     */
    const get = async (path, domain) => {
        const url = new URL(`${BASE_URL}${path}`);
        url.searchParams.set("domain", domain);

        /** @type {Response} */
        let response;
        try {
            response = await fetch(url, {
                headers: {
                    Authorization: `Token=${apiKey}`,
                    Accept: "application/json",
                },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch (error) {
            const reason =
                error instanceof Error && error.name === "TimeoutError"
                    ? `timeout after ${REQUEST_TIMEOUT_MS}ms`
                    : `network error - ${error instanceof Error ? error.message : String(error)}`;
            throw new WhoisJsonApiError(`WhoisJson API Error: ${reason}`, 0);
        }

        const text = await response.text();
        /** @type {any} */
        let body = null;
        try {
            body = text ? JSON.parse(text) : null;
        } catch {
            // Non-JSON body (e.g. an HTML error page) - handled below
        }

        if (!response.ok) {
            const apiMessage =
                body && typeof body.message === "string" ? body.message : null;
            throw new WhoisJsonApiError(
                `WhoisJson API Error: ${apiMessage || describeStatus(response.status)}`,
                response.status
            );
        }

        if (body === null) {
            throw new WhoisJsonApiError(
                "WhoisJson API Error: invalid JSON response",
                response.status
            );
        }

        return body;
    };

    return {
        lookup: (domain) => get("/whois", domain),
        checkDomainAvailability: (domain) => get("/domain-availability", domain),
        nslookup: (domain) => get("/nslookup", domain),
        ssl: (domain) => get("/ssl-cert-check", domain),
    };
};
