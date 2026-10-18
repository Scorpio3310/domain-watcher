/**
 * @fileoverview Fair verification planning shared by the cron and the manual
 * "Check Domains" button: picks which due domains to verify in one run from
 * the categories of SELECT_UNIFIED_DOMAINS_FOR_VERIFICATION. Kept in its own
 * module so the domain service and the cron can both use it without a
 * circular import.
 * @module VerificationPlan
 */

import { CONFIG } from "#lib/server/utils/domain-utils.js";
import { DOMAIN_STATUS } from "#lib/constants/constants.js";

/** @import { VerificationCandidate, VerificationPlan } from "#lib/types.js" */

/**
 * Share of the per-run verification cap kept for the round-robin tier while
 * it has due domains, so alert-critical rows (e.g. many domains sitting in a
 * registry grace period) can't take every slot and starve the rest forever
 */
const ROUND_ROBIN_MIN_SHARE = 0.25;

/**
 * Alert-critical verification rows: expired but still registered (did it
 * drop?) and never checked
 * @param {VerificationCandidate} domain - Unified-query row
 * @returns {boolean} True for alert-critical rows
 */
const isAlertCritical = (domain) =>
    domain.is_expired_registered === 1 ||
    domain.status === DOMAIN_STATUS.NOT_CHECKED;

/**
 * Staleness order: never checked first, then oldest last_domain_checked
 * (stored via CURRENT_TIMESTAMP, so the strings compare chronologically)
 * @param {VerificationCandidate} a - Row
 * @param {VerificationCandidate} b - Row
 * @returns {number} Sort comparator result
 */
const byStaleness = (a, b) => {
    const aChecked = a.last_domain_checked ?? "";
    const bChecked = b.last_domain_checked ?? "";
    return aChecked < bChecked ? -1 : aChecked > bChecked ? 1 : 0;
};

/**
 * Picks one run's verification list from the SQL-computed categories
 *
 * 1. Alert-critical rows strictly first: expired registered domains (did
 *    they become available?) and never-checked ("not_checked") ones.
 * 2. Everything else that is due - error, available, registered without
 *    expiry data (daily), daily/grace refresh, weekly safety net -
 *    round-robin by staleness (never checked first, then oldest
 *    last_domain_checked), so no category can starve another.
 * Scheduled runs then skip domains checked within the last 12 hours (manual
 * runs don't), and the list is capped at `limit`. While round-robin rows are
 * waiting, critical rows get at most (1 - ROUND_ROBIN_MIN_SHARE) of the cap.
 *
 * Every verified domain gets a fresh last_domain_checked (failures too),
 * so it moves to the back of its tier: each due domain is verified within
 * a bounded number of runs (cron reports or "Check Domains" clicks).
 *
 * @param {{expiredRegistered: VerificationCandidate[], needingVerification: VerificationCandidate[], needingRefresh: VerificationCandidate[]}} categories - Disjoint categories from domainVerification.getAllDomainsForVerification
 * @param {{manual?: boolean, limit?: number}} [options={}] - manual: also re-verify recently checked domains; limit: per-run cap
 * @returns {VerificationPlan} Domains to verify now plus skip/defer counts
 *
 * @example
 * const categories = await domainVerification.getAllDomainsForVerification();
 * const { domainsToVerify, deferred } = planVerification(categories, { manual: true });
 * console.log(`Verifying ${domainsToVerify.length}, ${deferred} left for later runs`);
 */
export const planVerification = (
    { expiredRegistered, needingVerification, needingRefresh },
    { manual = false, limit = CONFIG.LIMIT_DOMAIN_CHECKS } = {}
) => {
    const dueDomains = [
        ...expiredRegistered,
        ...needingVerification,
        ...needingRefresh,
    ];
    const eligibleDomains = manual
        ? dueDomains
        : dueDomains.filter((d) => d.is_recently_checked !== 1);

    const critical = eligibleDomains.filter(isAlertCritical).sort(byStaleness);
    const roundRobin = eligibleDomains
        .filter((d) => !isAlertCritical(d))
        .sort(byStaleness);

    // Never reserve the whole cap: critical rows always keep a slot
    const reserved = Math.min(
        roundRobin.length,
        Math.ceil(limit * ROUND_ROBIN_MIN_SHARE),
        Math.max(0, limit - 1)
    );
    const criticalToVerify = critical.slice(0, limit - reserved);
    const domainsToVerify = [
        ...criticalToVerify,
        ...roundRobin.slice(0, limit - criticalToVerify.length),
    ];

    return {
        domainsToVerify,
        critical: criticalToVerify.length,
        skippedRecent: dueDomains.length - eligibleDomains.length,
        deferred: eligibleDomains.length - domainsToVerify.length,
    };
};
