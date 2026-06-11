/**
 * @fileoverview Provider dispatcher for domain availability lookups.
 * Resolves the effective provider (RDAP or WhoisJSON) from settings and
 * routes checks accordingly, including the RDAP → WhoisJSON fallback for
 * TLDs without a public RDAP server.
 * @module DomainLookupService
 */

/** @import { ServiceResult, LookupContext } from '$lib/types' */

import * as rdapClient from "$src/lib/server/infrastructure/rdap-client";
import * as whoisClient from "$src/lib/server/infrastructure/whois-client";
import { apiKey } from "$src/lib/server/infrastructure/api-key";
import { domainProvider } from "$src/lib/server/services/settings";
import { DOMAIN_PROVIDER } from "$lib/constants/constants";

// ========================================
// PROVIDER RESOLUTION
// ========================================

/**
 * Resolves the effective lookup provider and WhoisJSON key state.
 * Default rules: a stored setting always wins; with no stored setting,
 * a configured WhoisJSON key resolves to WhoisJSON (existing installs keep
 * their behavior) and a keyless install resolves to RDAP (works out of the box).
 * @async
 * @returns {Promise<LookupContext>} Effective provider + key state
 *
 * @example
 * const context = await resolveLookupContext();
 * if (context.provider === DOMAIN_PROVIDER.RDAP) {
 *   console.log('Lookups are free — no API key needed');
 * }
 */
export async function resolveLookupContext() {
    const [providerConfig, whoisKeyConfigured] = await Promise.all([
        domainProvider.getConfig(),
        apiKey.isConfigured(),
    ]);

    const provider =
        providerConfig.provider ??
        (whoisKeyConfigured ? DOMAIN_PROVIDER.WHOIS_JSON : DOMAIN_PROVIDER.RDAP);

    return {
        provider,
        whoisKeyConfigured,
        whoisjsonFallback: providerConfig.whoisjsonFallback,
    };
}

/**
 * Predicts which provider the next check of a domain will use, without
 * performing the check. Mirrors checkDomainAvailability()'s dispatch logic.
 * @async
 * @param {string} domainName - Domain to predict for
 * @param {LookupContext} context - Pre-resolved lookup context
 * @returns {Promise<('rdap'|'whoisjson'|'none')>} 'none' = the check will error
 * @throws {Error} When the IANA bootstrap is unreachable and uncached (prediction unknown)
 */
export async function predictProvider(domainName, context) {
    if (context.provider === DOMAIN_PROVIDER.WHOIS_JSON) {
        return context.whoisKeyConfigured ? DOMAIN_PROVIDER.WHOIS_JSON : "none";
    }

    const baseUrl = await rdapClient.getRdapBaseUrl(domainName);
    if (baseUrl) return DOMAIN_PROVIDER.RDAP;

    return context.whoisKeyConfigured && context.whoisjsonFallback
        ? DOMAIN_PROVIDER.WHOIS_JSON
        : "none";
}

// ========================================
// PUBLIC API FUNCTIONS
// ========================================

/**
 * Provider-dispatched domain availability check. Returns the same
 * ServiceResult envelope as the underlying clients.
 * @async
 * @param {string} domainName - Domain to check
 * @param {LookupContext|null} [context=null] - Pre-resolved context (batch path); resolved on demand otherwise
 * @returns {Promise<ServiceResult>} Domain availability result
 *
 * @example
 * const result = await checkDomainAvailability('example.si');
 * if (result.status === 200) {
 *   console.log('Status:', result.data.status, 'via', result.data.source);
 * }
 */
export async function checkDomainAvailability(domainName, context = null) {
    const lookupContext = context ?? (await resolveLookupContext());

    if (lookupContext.provider === DOMAIN_PROVIDER.WHOIS_JSON) {
        if (!lookupContext.whoisKeyConfigured) {
            return {
                status: 400,
                message:
                    "WhoisJSON is selected but no API key is configured — add one in Settings or switch the provider to RDAP (free)",
            };
        }
        return whoisClient.checkDomainAvailability(domainName);
    }

    // RDAP path
    let baseUrl = null;
    let bootstrapFailed = false;
    try {
        baseUrl = await rdapClient.getRdapBaseUrl(domainName);
    } catch {
        bootstrapFailed = true; // IANA unreachable and no cached bootstrap
    }

    if (baseUrl) {
        return rdapClient.checkDomainAvailability(domainName, baseUrl);
    }

    // Unsupported TLD (or bootstrap outage): WhoisJSON fallback when allowed and possible
    if (lookupContext.whoisKeyConfigured && lookupContext.whoisjsonFallback) {
        return whoisClient.checkDomainAvailability(domainName);
    }

    if (bootstrapFailed) {
        return {
            status: 502,
            message:
                "RDAP bootstrap (IANA) is unreachable — try again later or add a WhoisJSON API key in Settings",
        };
    }
    const tld = domainName.split(".").pop();
    if (!lookupContext.whoisjsonFallback) {
        return {
            status: 400,
            message: `".${tld}" has no public RDAP server and WhoisJSON fallback is disabled — enable it in Settings${
                lookupContext.whoisKeyConfigured
                    ? ""
                    : " and add a WhoisJSON API key"
            } to check this domain`,
        };
    }
    return {
        status: 400,
        message: `".${tld}" has no public RDAP server — add a WhoisJSON API key in Settings to check this domain`,
    };
}
