/** @import { DomainRecord, ServiceResult } from '$lib/types' */

import { error } from "@sveltejs/kit";
import { getErrorMessage, getHttpStatus, getRegistrar } from "$lib/utils/helpers";
import { message, superValidate, fail } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { addDomainSchema } from "./validation";
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

        // Create form instances
        const formAddDomain = await superValidate(zod4(addDomainSchema));

        return {
            domains: processedDomains,
            viewMode,
            formAddDomain,
        };
    } catch (err) {
        console.error("❌ Page load failed:", err);
        throw error(getHttpStatus(err), {
            message: getErrorMessage(err),
        });
    }
}

// ========================================
// FORM ACTIONS
// ========================================

export const actions = {
    /**
     * Add a new domain to the watchlist
     */
    addDomain: async ({ request }) => {
        const addDomainForm = await superValidate(
            request,
            zod4(addDomainSchema)
        );

        if (!addDomainForm.valid) {
            return fail(400, { form: addDomainForm });
        }

        const addResult = /** @type {ServiceResult} */ (
            await domains.add(addDomainForm.data.domainName)
        );

        return message(addDomainForm, {
            status: addResult.status,
            message: addResult.message,
        });
    },
};
