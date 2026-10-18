/** @import { DomainRecord, ServiceResult } from '#lib/types.js' */

import { error } from "@sveltejs/kit";
import {
    getErrorMessage,
    getHttpStatus,
    getRegistrar,
    getLookupSource,
} from "#lib/utils/helpers.js";
import { domains } from "#lib/server/services/domain.js";
import { ui } from "#lib/server/services/settings.js";
import {
    resolveLookupContext,
    predictProvider,
} from "#lib/server/services/domain-lookup.js";

// ========================================
// PAGE LOAD
// ========================================

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    try {
        // Fetch all required data in parallel
        const [rawDomainsData, viewMode, lookupContext] = await Promise.all([
            domains.getAll(),
            ui.getViewMode(),
            resolveLookupContext().catch(() => null),
        ]);

        // Process domains on server-side and add computed properties
        const domainsResult = /** @type {ServiceResult} */ (rawDomainsData);
        const domainRecords = /** @type {DomainRecord[]} */ (
            domainsResult?.data || []
        );

        // Predict which provider the next check of each domain will use.
        // Parallel calls share one in-flight bootstrap fetch; per-domain
        // failures (IANA bootstrap unreachable) degrade to null = unknown.
        // The deadline keeps first paint DB-bound when the bootstrap cache is
        // cold and IANA is slow — predictions just come back on the next load.
        const PREDICTION_DEADLINE_MS = 2500;
        /** @type {Array<('rdap'|'whoisjson'|'none')|null>} */
        const unknownPredictions = domainRecords.map(() => null);
        /** @type {ReturnType<typeof setTimeout>|undefined} */
        let deadlineTimer;
        const predictions = lookupContext
            ? await Promise.race([
                  Promise.all(
                      domainRecords.map(async (domainRecord) => {
                          try {
                              return await predictProvider(
                                  domainRecord.domain_name,
                                  lookupContext
                              );
                          } catch {
                              return null;
                          }
                      })
                  ),
                  new Promise((resolve) => {
                      deadlineTimer = setTimeout(
                          resolve,
                          PREDICTION_DEADLINE_MS
                      );
                  }).then(() => unknownPredictions),
              ]).finally(() => clearTimeout(deadlineTimer))
            : unknownPredictions;

        const processedDomains = domainRecords.map((domainRecord, index) => ({
            ...domainRecord,
            registrar: getRegistrar(domainRecord.raw_domain_data ?? null),
            source: getLookupSource(domainRecord.raw_domain_data ?? null),
            willCheckVia: predictions[index],
        }));

        return {
            domains: processedDomains,
            viewMode,
            lookupProvider: lookupContext?.provider ?? null,
            whoisjsonFallback: lookupContext?.whoisjsonFallback ?? true,
        };
    } catch (err) {
        console.error("❌ Page load failed:", err);
        throw error(getHttpStatus(err), getErrorMessage(err));
    }
}
