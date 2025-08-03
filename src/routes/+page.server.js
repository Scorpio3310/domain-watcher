import { error } from "@sveltejs/kit";
import { getRegistrar } from "$lib/utils/helpers";
import { message, superValidate, fail } from "sveltekit-superforms";
import { zod4 } from "sveltekit-superforms/adapters";
import { addDomainSchema, domainIdSchema } from "./validation";
import { domains, check } from "$src/lib/server/domains";
import { ui } from "$src/lib/server/settings";

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
        const processedDomains = (rawDomainsData?.data || []).map(
            (domainRecord) => ({
                ...domainRecord,
                registrar: getRegistrar(domainRecord.raw_domain_data),
            })
        );

        // Create form instances
        const formAddDomain = await superValidate(zod4(addDomainSchema));
        const formDomainId = await superValidate(zod4(domainIdSchema));

        return {
            domains: processedDomains,
            viewMode,
            formAddDomain,
            formDomainId,
        };
    } catch (err) {
        console.error("❌ Page load failed:", err);
        throw error(err?.status || 500, {
            message: `${err?.message}`,
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

        const addResult = await domains.add(addDomainForm.data.domainName);

        return message(addDomainForm, {
            status: addResult.status,
            message: addResult.message,
        });
    },

    /**
     * Remove a domain from the watchlist
     */
    deleteDomain: async ({ request }) => {
        const deleteDomainForm = await superValidate(
            request,
            zod4(domainIdSchema)
        );

        if (!deleteDomainForm.valid) {
            return fail(400, { form: deleteDomainForm });
        }

        const deleteResult = await domains.remove(
            deleteDomainForm.data.domainId
        );

        return message(deleteDomainForm, {
            status: deleteResult.status,
            message: deleteResult.message,
        });
    },

    /**
     * Batch check multiple domains
     */
    checkDomains: async () => {
        const batchResult = await check.batch();

        return {
            status: batchResult.status,
            message: batchResult.message,
        };
    },

    /**
     * Manually verify a specific domain
     */
    manuallyCheckDomain: async ({ request }) => {
        const verifyDomainForm = await superValidate(
            request,
            zod4(domainIdSchema)
        );

        if (!verifyDomainForm.valid) {
            return fail(400, { form: verifyDomainForm });
        }

        const verificationResult = await check.domain(
            verifyDomainForm.data.domainId
        );

        return message(verifyDomainForm, {
            status: verificationResult.status,
            message: verificationResult.message,
        });
    },

    /**
     * Check nameserver information for a domain
     */
    checkNSInfo: async ({ request }) => {
        const nsCheckForm = await superValidate(request, zod4(domainIdSchema));

        if (!nsCheckForm.valid) {
            return fail(400, { form: nsCheckForm });
        }

        const nsCheckResult = await check.ns(nsCheckForm.data.domainId);

        return message(nsCheckForm, {
            status: nsCheckResult.status,
            message: nsCheckResult.message,
        });
    },

    /**
     * Check SSL certificate information for a domain
     */
    checkSSLInfo: async ({ request }) => {
        const sslCheckForm = await superValidate(request, zod4(domainIdSchema));

        if (!sslCheckForm.valid) {
            return fail(400, { form: sslCheckForm });
        }

        const sslCheckResult = await check.ssl(sslCheckForm.data.domainId);

        return message(sslCheckForm, {
            status: sslCheckResult.status,
            message: sslCheckResult.message,
        });
    },
};
