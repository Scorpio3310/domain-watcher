/**
 * @fileoverview RDAP (Registration Data Access Protocol) domain lookups with
 * IANA bootstrap caching. Free registry-level availability and expiration
 * data — no API key required. Results are normalized into the same envelope
 * as the WhoisJSON client so all downstream consumers stay provider-agnostic.
 * @module RdapClient
 */

/** @import { ServiceResult } from '$lib/types' */

import { DOMAIN_STATUS } from "$lib/constants/constants";
import { getErrorMessage } from "$lib/utils/helpers";

// ========================================
// CONSTANTS & CONFIG
// ========================================

const IANA_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const BOOTSTRAP_FETCH_TIMEOUT_MS = 15_000;
/** Retry-After values above this are not worth blocking a batch for */
const MAX_RETRY_AFTER_SECONDS = 5;

/**
 * Working RDAP servers missing from the IANA bootstrap (verified 2026-06).
 * .de and .ch registries do not publish expiration dates at all — those
 * domains stay `registered` with `expires: null`.
 */
const SUPPLEMENTAL_RDAP_SERVERS = Object.freeze({
    de: "https://rdap.denic.de/",
    ch: "https://rdap.nic.ch/",
    io: "https://rdap.identitydigital.services/rdap/",
    me: "https://rdap.identitydigital.services/rdap/",
});

/** TLDs with no public RDAP service at all → WhoisJSON fallback required */
const NO_RDAP_TLDS = Object.freeze(
    new Set(["co", "eu", "at", "hr", "rs", "it", "es", "us"])
);

// ========================================
// IANA BOOTSTRAP CACHE
// ========================================

/** @type {{map: Map<string, string>|null, fetchedAt: number}} */
let bootstrapCache = { map: null, fetchedAt: 0 };
/** @type {Promise<Map<string, string>>|null} In-flight fetch shared by concurrent callers */
let bootstrapPromise = null;

/**
 * Extracts the TLD used for bootstrap lookup (last label, lowercased)
 * @param {string} domainName - Domain name (e.g., 'example.co.uk')
 * @returns {string} TLD (e.g., 'uk')
 */
const getTld = (domainName) =>
    domainName.toLowerCase().replace(/\.$/, "").split(".").pop() ?? "";

/**
 * Fetches and parses the IANA RDAP bootstrap registry.
 * Only https base URLs are accepted — the rare http-only entries (.kg/.mg)
 * are skipped so registration data is never fetched over plaintext; those
 * TLDs take the same no-RDAP fallback path as unlisted ones.
 * @async
 * @returns {Promise<Map<string, string>>} TLD → RDAP base URL map
 * @throws {Error} When the bootstrap cannot be fetched and no cache exists
 */
const fetchBootstrapMap = async () => {
    try {
        const response = await fetch(IANA_BOOTSTRAP_URL, {
            headers: { accept: "application/json" },
            signal: AbortSignal.timeout(BOOTSTRAP_FETCH_TIMEOUT_MS),
        });
        if (!response.ok) {
            throw new Error(`IANA bootstrap returned HTTP ${response.status}`);
        }

        const data = await response.json();
        const map = new Map();
        for (const [tlds, urls] of data?.services ?? []) {
            const url = urls?.find((/** @type {string} */ u) =>
                u.startsWith("https://")
            );
            if (!url) continue;
            const normalizedUrl = url.endsWith("/") ? url : `${url}/`;
            for (const tld of tlds) map.set(tld.toLowerCase(), normalizedUrl);
        }

        bootstrapCache = { map, fetchedAt: Date.now() };
        return map;
    } catch (error) {
        // Stale beats nothing — keep working through an IANA outage
        if (bootstrapCache.map) return bootstrapCache.map;
        throw new Error(`RDAP bootstrap unavailable: ${getErrorMessage(error)}`);
    }
};

/**
 * Loads the IANA RDAP bootstrap registry, cached in-memory for 24h.
 * Concurrent callers share one in-flight fetch (batch checks fire several
 * lookups in parallel on a cold isolate).
 * @async
 * @returns {Promise<Map<string, string>>} TLD → RDAP base URL map
 * @throws {Error} When the bootstrap cannot be fetched and no cache exists
 */
const loadBootstrapMap = async () => {
    if (
        bootstrapCache.map &&
        Date.now() - bootstrapCache.fetchedAt < BOOTSTRAP_TTL_MS
    ) {
        return bootstrapCache.map;
    }
    if (!bootstrapPromise) {
        bootstrapPromise = fetchBootstrapMap().finally(() => {
            bootstrapPromise = null;
        });
    }
    return bootstrapPromise;
};

/**
 * Resolves the RDAP base URL for a domain via supplemental map + IANA bootstrap
 * @async
 * @param {string} domainName - Domain to resolve (e.g., 'example.si')
 * @returns {Promise<string|null>} Base URL ending with '/', or null when the TLD has no RDAP
 * @throws {Error} When the IANA bootstrap cannot be loaded and no cache exists
 */
export async function getRdapBaseUrl(domainName) {
    const tld = getTld(domainName);
    if (NO_RDAP_TLDS.has(tld)) return null;
    if (Object.hasOwn(SUPPLEMENTAL_RDAP_SERVERS, tld)) {
        return SUPPLEMENTAL_RDAP_SERVERS[
            /** @type {keyof typeof SUPPLEMENTAL_RDAP_SERVERS} */ (tld)
        ];
    }

    const bootstrapMap = await loadBootstrapMap();
    return bootstrapMap.get(tld) ?? null;
}

// ========================================
// RESPONSE NORMALIZATION
// ========================================

/**
 * Normalizes an RDAP eventDate to the WhoisJSON-identical ISO format
 * ("2028-09-14T04:00:00Z"). Handles fractional seconds, ±hh:mm offsets
 * (DENIC) and date-only values (SWITCH).
 * @param {string} value - RDAP eventDate
 * @returns {string|null} Normalized UTC ISO string or null when unparseable
 */
const normalizeRdapDate = (value) => {
    const date = new Date(value);
    return isNaN(date.getTime())
        ? null
        : date.toISOString().replace(/\.\d{3}Z$/, "Z");
};

/**
 * Extracts the expiration date from RDAP events
 * @param {Array<{eventAction?: string, eventDate?: string}>} [events] - RDAP events array
 * @returns {string|null} Normalized expiration date or null (e.g., .de/.ch publish none)
 */
const extractExpires = (events) => {
    const list = Array.isArray(events) ? events : [];
    const event =
        list.find((e) => e?.eventAction === "expiration") ??
        list.find((e) => e?.eventAction === "registrar expiration");
    return event?.eventDate ? normalizeRdapDate(event.eventDate) : null;
};

/**
 * Extracts the registrar from RDAP entities (jCard format, RFC 7095).
 * Shape matches the WhoisJSON `registrar` object so getRegistrar() keeps working.
 * @param {Array<Record<string, any>>} [entities] - RDAP entities array
 * @returns {{name: string, url: string|null}|null} Registrar info or null
 */
const extractRegistrar = (entities) => {
    const registrarEntity = (Array.isArray(entities) ? entities : []).find(
        (entity) => entity?.roles?.includes("registrar")
    );
    const fnEntry = registrarEntity?.vcardArray?.[1]?.find(
        (/** @type {any} */ entry) => Array.isArray(entry) && entry[0] === "fn"
    );
    const name =
        typeof fnEntry?.[3] === "string" && fnEntry[3].trim()
            ? fnEntry[3].trim()
            : null;
    return name ? { name, url: null } : null;
};

// ========================================
// PUBLIC API FUNCTIONS
// ========================================

/**
 * Fetches an RDAP URL, retrying once on 429 when Retry-After is short
 * @param {string} url - Full RDAP query URL
 * @returns {Promise<Response>} Fetch response (redirects followed by default)
 */
const rdapFetch = async (url) => {
    /** @type {RequestInit} */
    const options = {
        headers: { accept: "application/rdap+json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    };
    let response = await fetch(url, options);

    if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        if (retryAfter > 0 && retryAfter <= MAX_RETRY_AFTER_SECONDS) {
            await new Promise((resolve) =>
                setTimeout(resolve, retryAfter * 1000)
            );
            response = await fetch(url, {
                ...options,
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
        }
    }
    return response;
};

/**
 * Check domain availability via the registry's RDAP server.
 * HTTP 404 means the domain is not registered (Verisign returns 404 with an
 * EMPTY body — the body is never parsed on that branch). Any non-404 failure
 * maps to an error status so a throttled registry can never report 'available'.
 * @async
 * @param {string} domainName - Domain to check
 * @param {string} baseUrl - RDAP base URL from getRdapBaseUrl()
 * @returns {Promise<ServiceResult>} Domain availability result (same envelope as whois-client)
 *
 * @example
 * const baseUrl = await getRdapBaseUrl('example.si');
 * const result = await checkDomainAvailability('example.si', baseUrl);
 * if (result.status === 200) {
 *   console.log('Domain status:', result.data.status);
 * }
 */
export async function checkDomainAvailability(domainName, baseUrl) {
    try {
        console.log(`🔍 RDAP availability check for ${domainName}`);

        const response = await rdapFetch(
            `${baseUrl}domain/${encodeURIComponent(domainName)}`
        );

        if (response.status === 404) {
            return {
                status: 200,
                message: "Domain availability checked successfully",
                data: {
                    domain: domainName,
                    status: DOMAIN_STATUS.AVAILABLE,
                    expires: null,
                    registrar: null,
                    rawDomainData: {
                        available: true,
                        httpStatus: 404,
                        rdapServer: baseUrl,
                    },
                    source: "rdap",
                },
            };
        }

        if (response.ok) {
            const rdapData = await response.json();
            return {
                status: 200,
                message: "Domain availability checked successfully",
                data: {
                    domain: domainName,
                    status: DOMAIN_STATUS.REGISTERED,
                    expires: extractExpires(rdapData?.events),
                    registrar: extractRegistrar(rdapData?.entities),
                    rawDomainData: rdapData,
                    source: "rdap",
                },
            };
        }

        if (response.status === 429) {
            return {
                status: 429,
                message: `RDAP rate limit hit for ${domainName} — try again in a bit`,
            };
        }
        if (response.status === 403 || response.status >= 500) {
            return {
                status: 502,
                message: `RDAP server error for ${domainName} (HTTP ${response.status})`,
            };
        }
        return {
            status: 400,
            message: `RDAP query rejected for ${domainName} (HTTP ${response.status})`,
        };
    } catch (error) {
        console.error(`❌ RDAP lookup failed for ${domainName}:`, error);
        return {
            status: 502,
            message: `RDAP lookup failed for ${domainName}: ${getErrorMessage(error)}`,
        };
    }
}
