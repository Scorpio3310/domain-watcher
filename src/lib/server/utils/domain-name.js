/**
 * @fileoverview Registrable-domain checks based on the ICANN section of the
 * Public Suffix List (tldts-icann). Server-only on purpose: the shared
 * validation schemas run in the browser too and must stay free of the list.
 * @module DomainNameUtils
 */

import { getDomain, getPublicSuffix } from "tldts-icann";

/**
 * Checks that a (lowercased) name is a registrable domain. Subdomains such as
 * www.example.com or foo.github.io have no registration of their own: RDAP
 * answers 404 for them, which would be reported as "available" every day.
 *
 * @function getRegistrableDomainIssue
 * @memberof module:DomainNameUtils
 * @param {string} domainName - Domain name to check
 * @returns {string|null} Issue message, or null when the name is registrable
 *
 * @example
 * getRegistrableDomainIssue("example.co.uk");   // null
 * getRegistrableDomainIssue("www.example.com"); // 'Enter the registrable domain "example.com", not a subdomain'
 */
export const getRegistrableDomainIssue = (domainName) => {
    const registrable = getDomain(domainName);

    if (registrable === domainName) return null;

    if (registrable) {
        return `Enter the registrable domain "${registrable}", not a subdomain`;
    }

    // No registrable part: a public suffix itself (co.uk), an IP address, ...
    const suffix = getPublicSuffix(domainName);
    return suffix === domainName
        ? `"${domainName}" is a domain extension, not a registrable domain - enter a full domain like example.${suffix}`
        : `"${domainName}" is not a registrable domain - enter a domain like example.com`;
};
