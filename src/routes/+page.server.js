/** @import { DomainRecord, ServiceResult } from '$lib/types' */

import { error } from "@sveltejs/kit";
import { getErrorMessage, getHttpStatus, getRegistrar } from "$lib/utils/helpers";
import { domains } from "$src/lib/server/services/domain";
import { ui } from "$src/lib/server/services/settings";

// ========================================
// PAGE LOAD
// ========================================

/** @type {import('./$types').PageServerLoad} */
export async function load() {
    try {
        // Fetch all required data in parallel
        const [rawDomainsData, viewMode] = await Promise.all([
            domains.getAll(),
            ui.getViewMode(),
        ]);

        // Process domains on server-side and add computed properties
        const domainsResult = /** @type {ServiceResult} */ (rawDomainsData);
        const domainRecords = /** @type {DomainRecord[]} */ (
            domainsResult?.data || []
        );
        const processedDomains = domainRecords.map((domainRecord) => ({
            ...domainRecord,
            registrar: getRegistrar(domainRecord.raw_domain_data ?? null),
        }));

        return {
            domains: processedDomains,
            viewMode,
        };
    } catch (err) {
        console.error("❌ Page load failed:", err);
        throw error(getHttpStatus(err), {
            message: getErrorMessage(err),
        });
    }
}
