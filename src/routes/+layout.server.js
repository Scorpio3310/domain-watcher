import { resolveLookupContext } from "$src/lib/server/services/domain-lookup";
import { DOMAIN_PROVIDER } from "$lib/constants/constants";

export async function load() {
    const context = await resolveLookupContext().catch(() => null);

    return {
        /** WhoisJSON key state — drives the SSL check button on domain cards */
        isApiConfigured: context?.whoisKeyConfigured ?? false,
        /** Whether domain lookups can run at all — drives the header nag dot */
        isLookupReady:
            context != null &&
            (context.provider === DOMAIN_PROVIDER.RDAP ||
                context.whoisKeyConfigured),
    };
}
