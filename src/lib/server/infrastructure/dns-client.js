/**
 * @fileoverview Nameserver/DNS lookups via Cloudflare DNS-over-HTTPS.
 * Free, no API key, provider-independent. Returns the same ServiceResult
 * shape as the previous WhoisJSON-based NS lookup so storage
 * (UPDATE_DOMAIN_NS) and the raw JSON viewer stay unchanged.
 * @module DnsClient
 */

/** @import { ServiceResult } from '$lib/types' */

import { getErrorMessage } from "$lib/utils/helpers";

// ========================================
// CONSTANTS & CONFIG
// ========================================

const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";
const RECORD_TYPES = ["NS", "A", "AAAA", "MX", "TXT", "SOA"];
const FETCH_TIMEOUT_MS = 10_000;

/** DNS response codes that mean "query worked": NOERROR and NXDOMAIN */
const OK_DNS_RCODES = new Set([0, 3]);

// ========================================
// CORE UTILITIES
// ========================================

/**
 * Queries a single DNS record type via DoH.
 * NXDOMAIN (Status 3) yields an empty list, not an error; resolution
 * failures like SERVFAIL/REFUSED throw so they never get stored as a
 * successful "no records" result.
 * @async
 * @param {string} domainName - Domain to query
 * @param {string} type - DNS record type (NS, A, MX, ...)
 * @returns {Promise<string[]>} Record data values
 * @throws {Error} On HTTP-level or DNS-level (rcode) failures
 */
const queryRecord = async (domainName, type) => {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(domainName)}&type=${type}`;
    const response = await fetch(url, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new Error(`DoH ${type} query failed: HTTP ${response.status}`);
    }

    const result = await response.json();
    if (!OK_DNS_RCODES.has(result?.Status)) {
        throw new Error(
            `DoH ${type} query failed: DNS rcode ${result?.Status} (e.g. SERVFAIL/REFUSED)`
        );
    }
    return (result?.Answer ?? []).map(
        (/** @type {{data: string}} */ answer) => answer.data
    );
};

// ========================================
// PUBLIC API FUNCTIONS
// ========================================

/**
 * Perform NS/DNS lookup for a domain via Cloudflare DNS-over-HTTPS
 * @async
 * @param {string} domainName - Domain name to lookup
 * @returns {Promise<ServiceResult>} DNS lookup result
 *
 * @example
 * const result = await checkDomainNS('example.com');
 * if (result.status === 200) {
 *   console.log('NS records:', result.data.rawDomainData.records.ns);
 * }
 */
export async function checkDomainNS(domainName) {
    try {
        console.log(`🔍 DoH NS lookup for ${domainName}`);

        const entries = await Promise.all(
            RECORD_TYPES.map(async (type) => [
                type.toLowerCase(),
                await queryRecord(domainName, type),
            ])
        );

        return {
            status: 200,
            message: "NS lookup completed successfully",
            data: {
                domain: domainName,
                rawDomainData: {
                    domain: domainName,
                    records: Object.fromEntries(entries),
                    source: "cloudflare-doh",
                    resolvedAt: new Date().toISOString(),
                },
            },
        };
    } catch (error) {
        console.error(`❌ DNS lookup failed for ${domainName}:`, error);
        return {
            status: 502,
            message: `DNS lookup failed for ${domainName}: ${getErrorMessage(error)}`,
        };
    }
}
