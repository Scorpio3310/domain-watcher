<script>
    import Button from "#components/Button.svelte";
    import Icon from "@iconify/svelte";
    import { slide, fly } from "svelte/transition";
    import { UI_DOMAIN_VIEW } from "#lib/constants/constants.js";
    import {
        DOMAIN_STATUS,
        DOMAIN_PROVIDER,
    } from "#lib/constants/constants.js";
    import { isDemo } from "#lib/utils/helpers.js";
    import Tooltip from "#components/Tooltip.svelte";
    import { toast } from "#lib/stores/toast.svelte.js";
    import {
        formatHumanDate,
        formatExpirationDate,
        formatLastChecked,
        getExpirationStatus,
    } from "#lib/utils/helpers.js";
    import { ssl, ns, check, remove } from "#lib/remote/domain-card.remote.js";
    import { getDomainDetails } from "#lib/remote/domain-details.remote.js";

    //// PROPS ////
    /** @type {{data: import('#lib/types.js').DomainRecord, uiView?: string, isApiConfigured?: boolean, lookupProvider?: ('rdap'|'whoisjson')|null, whoisjsonFallback?: boolean}} */
    let {
        data,
        uiView,
        isApiConfigured = false,
        lookupProvider = null,
        whoisjsonFallback = true,
    } = $props();

    //// FORM INSTANCES (isolated per domain) ////
    const nsForm = $derived(ns.for(data?.id));
    const sslForm = $derived(ssl.for(data?.id));
    const checkForm = $derived(check.for(data?.id));
    const removeForm = $derived(remove.for(data?.id));

    //// STATES ////
    let isExpanded = $state(false);
    let showDeleteConfirmation = $state(false);

    /**
     * Toggle expansion state for showing more/less details
     */
    const toggleExpansion = () => {
        isExpanded = !isExpanded;
    };

    /**
     * Show delete confirmation UI
     */
    const showDeleteDialog = () => {
        showDeleteConfirmation = true;
    };

    /**
     * Cancel delete operation and return to normal view
     */
    const cancelDelete = () => {
        showDeleteConfirmation = false;
    };

    /**
     * Get button text based on expansion state
     */
    const buttonText = $derived(isExpanded ? "Show Less" : "Show More");

    /**
     * Domain name for accessible button labels (distinct per card)
     */
    const domainName = $derived(data?.domain_name || "domain");

    /**
     * Get button icon with rotation based on expansion state
     */
    const buttonIcon = $derived("iconoir:nav-arrow-up");
    const buttonIconClass = $derived(
        `transition-all duration-200 ease-in-out ${isExpanded ? "rotate-180" : ""}`,
    );

    //// RAW LOOKUP DATA (loaded on demand) ////
    // The page data carries no raw RDAP/WhoisJSON/NS/SSL JSON - it is fetched
    // only while the card is expanded. The NS/SSL/scan forms below refresh
    // every active query after a successful submission, so an open card shows
    // the new data without extra wiring.
    const details = $derived(isExpanded ? getDomainDetails(data.id) : null);

    /**
     * Query started before the card expands - kept referenced so its cached
     * result is still there when `details` above asks for the same domain
     * @type {ReturnType<typeof getDomainDetails> | null}
     */
    let prefetchedDetails = null;

    /**
     * Starts loading the raw lookup data on hover/focus of "Show More", so the
     * slide-open animation measures the loaded content instead of the
     * one-line loading placeholder (which made the card snap at the end)
     */
    const prefetchDetails = () => {
        if (isExpanded || prefetchedDetails) return;
        prefetchedDetails = getDomainDetails(data.id);
        // Errors surface on the expanded card's own query
        prefetchedDetails.catch(() => {});
    };

    /**
     * Pretty-prints stored JSON for the <pre> blocks
     * @param {string|null} rawJson - Stored JSON string
     * @returns {string} Indented JSON, or the raw text if it isn't valid JSON
     */
    const formatJson = (rawJson) => {
        try {
            return JSON.stringify(JSON.parse(rawJson || "{}"), null, 2);
        } catch {
            return rawJson ?? "";
        }
    };

    //// PROVIDER TRANSPARENCY ////
    const tld = $derived(data?.domain_name?.split(".").pop() ?? "");
    // willCheckVia === "none" means the next check would just error
    const scanBlocked = $derived(data?.willCheckVia === "none");
    const scanTooltip = $derived.by(() => {
        switch (data?.willCheckVia) {
            case DOMAIN_PROVIDER.RDAP:
                return "Will check via RDAP";
            case DOMAIN_PROVIDER.WHOIS_JSON:
                return lookupProvider === DOMAIN_PROVIDER.RDAP
                    ? `Will check via WhoisJSON (.${tld} has no RDAP)`
                    : "Will check via WhoisJSON";
            case "none":
                if (lookupProvider === DOMAIN_PROVIDER.WHOIS_JSON) {
                    return "WhoisJSON is selected but no API key is configured — add one in Settings";
                }
                // Mirror the server's branch order: fallback state first,
                // then the key requirement
                if (!whoisjsonFallback) {
                    return `.${tld} has no RDAP server and WhoisJSON fallback is disabled — enable it in Settings${
                        isApiConfigured ? "" : " and add a WhoisJSON API key"
                    }`;
                }
                return `.${tld} has no RDAP server — add a WhoisJSON API key in Settings`;
            default:
                return ""; // unknown (bootstrap outage) — plain button, no tooltip
        }
    });
</script>

<div class="card card--domain">
    <div class="main-content">
        <div class="main-info">
            <div class="icon-status">
                <Icon icon="iconoir:globe" class="icon-globe" />
                {@render showStatus(data?.status ?? "")}
            </div>

            <h3>{data?.domain_name || "Error"}</h3>
            {#if data?.status === DOMAIN_STATUS.NOT_CHECKED}
                <Tooltip
                    text="Domains added to watchlist aren't auto-checked. Click 'Check Domains' for batch verification or use 'Scan Now' for individual verification."
                    position="bottom"
                    offset={8}
                    tabindex={0}
                >
                    <div
                        class="bg-blue/10 text-blue px-3 py-1 rounded-full flex-none w-max flex items-center gap-1"
                    >
                        Run check
                        <Icon icon="iconoir:info-circle" />
                    </div>
                </Tooltip>
            {/if}
        </div>

        <div class="container-for-animation">
            <!-- Normal buttons view -->
            {#if !showDeleteConfirmation}
                <div
                    class="buttons absolute"
                    in:fly={{ x: 250, duration: 300, delay: 200, opacity: 0 }}
                    out:fly={{ x: 250, duration: 600, opacity: 0 }}
                >
                    <Button
                        text={buttonText}
                        size="md"
                        icon={buttonIcon}
                        iconClass={buttonIconClass}
                        color="white"
                        onclick={toggleExpansion}
                        onpointerenter={prefetchDetails}
                        onfocus={prefetchDetails}
                        ariaLabel="{buttonText} details for {domainName}"
                        aria-expanded={isExpanded}
                    />

                    <Button
                        type="button"
                        size="md"
                        iconClass="text-red"
                        icon="iconoir:trash"
                        color="white"
                        onclick={showDeleteDialog}
                        ariaLabel="Delete {domainName}"
                    />
                </div>
            {/if}

            <!-- Delete confirmation view -->
            {#if showDeleteConfirmation}
                <div
                    class="buttons absolute"
                    in:fly={{ x: 250, duration: 300, delay: 200, opacity: 0 }}
                    out:fly={{ x: 250, duration: 600, opacity: 0 }}
                >
                    <Button
                        text="Cancel"
                        size="md"
                        iconClass="text-gray-500"
                        color="black-outline"
                        onclick={cancelDelete}
                        ariaLabel="Cancel deleting {domainName}"
                    />

                    <form
                        {...removeForm.enhance(async ({ submit }) => {
                            try {
                                if (await submit()) {
                                    if (removeForm.result)
                                        toast.show(removeForm.result);
                                } else {
                                    const issues =
                                        removeForm.fields.allIssues() ?? [];
                                    toast.show({
                                        status: 400,
                                        message: issues
                                            .map((i) => i.message)
                                            .join(", "),
                                    });
                                }
                            } catch (error) {
                                toast.show({
                                    status: 500,
                                    message: "Something went wrong",
                                });
                            }
                        })}
                    >
                        <input
                            {...removeForm.fields.domainId.as(
                                "hidden",
                                data?.id,
                            )}
                        />
                        {#if isDemo()}
                            <Button
                                type="submit"
                                text="Delete"
                                size="md"
                                icon="iconoir:trash"
                                color="black"
                                class="button--red "
                                ariaLabel="Delete {domainName} (confirm)"
                                disabled={isDemo()}
                            />
                        {:else}
                            <Button
                                type="submit"
                                text="Delete"
                                size="md"
                                icon="iconoir:trash"
                                color="black"
                                class="button--red "
                                ariaLabel="Delete {domainName} (confirm)"
                                disabled={!!removeForm.pending}
                            />
                        {/if}
                    </form>
                </div>
            {/if}
        </div>
    </div>

    <!-- COMPACT VIEW -->
    {#if uiView === UI_DOMAIN_VIEW.COMPACT}
        {#if isExpanded}
            <div class="details" transition:slide={{ duration: 600 }}>
                <div class="expand">
                    <hr />
                    {@render basicInfo()}
                    {@render expandedInfo()}
                </div>
            </div>
        {/if}
    {/if}

    <!-- DETAILED VIEW -->
    {#if uiView === UI_DOMAIN_VIEW.DETAILED}
        <div class="details">
            <hr />
            {@render basicInfo()}

            {#if isExpanded}
                <div class="expand" transition:slide={{ duration: 600 }}>
                    {@render expandedInfo()}
                </div>
            {/if}
        </div>
    {/if}
</div>

<!-- 
////////////////////////// SNIPPETS //////////////////////////
-->

{#snippet basicInfo()}
    <p class="inline">
        <span class="opacity-50">Status:</span>
        {@render statusTextFormat(data?.status ?? DOMAIN_STATUS.ERROR)}
    </p>
    <hr />
    <p class="inline">
        <span class="opacity-50">Registrar:</span>
        {data?.registrar || "/"}
    </p>
    <hr />
    <p class="inline">
        <span class="opacity-50">Expiration Date:</span>
        {formatExpirationDate(data?.expires ?? null, {
            showRemaining: false,
        }) || "/"}
        {#if data?.expires}
            <span class={getExpirationStatus(data?.expires)?.className}>
                ({formatExpirationDate(data?.expires, {
                    showDate: false,
                    showRemaining: true,
                    showTime: false,
                })})
            </span>
        {/if}
    </p>
{/snippet}

{#snippet expandedInfo()}
    <hr class="mt-2.5!" />
    <p class="inline">
        <span class="opacity-50">ID:</span>
        {data?.id || "/"}
    </p>
    <hr />
    <p class="inline">
        <span class="opacity-50">Last Checked:</span>
        {formatLastChecked(data?.last_domain_checked ?? null) || "Never"}
    </p>
    <hr />
    <p class="inline">
        <span class="opacity-50">Checked via:</span>
        <!-- On error the stored source describes the last SUCCESSFUL check,
             which would misattribute the just-failed attempt -->
        {data?.status === DOMAIN_STATUS.ERROR ? "/" : data?.source || "/"}
    </p>
    <hr />
    <p class="inline">
        <span class="opacity-50">Added At:</span>
        {formatHumanDate(data?.created_at ?? null) || "/"}
    </p>
    <hr />
    {@render rawData()}
    {@render otherButtons()}
{/snippet}

{#snippet rawData()}
    {#if details?.error}
        <div class="flex flex-wrap items-center gap-2">
            <span class="text-orange-500">
                Couldn't load the lookup data{details.error.message
                    ? ` (${details.error.message})`
                    : ""}.
            </span>
            <Button
                text="Retry"
                size="sm"
                color="white"
                icon="iconoir:refresh-double"
                iconClass={details.loading ? "animate-spin" : ""}
                disabled={details.loading}
                onclick={() => details?.refresh()}
                ariaLabel="Retry loading lookup data for {domainName}"
            />
        </div>
        <hr />
    {:else if !details?.ready}
        <p class="text-inline opacity-50">
            <Icon icon="iconoir:refresh-double" class="icon animate-spin" />
            Loading lookup data…
        </p>
        <hr />
    {:else if details.current}
        <!-- current is null only for a just-deleted domain (card is leaving) -->
        {@const { rawDomainData, rawNsData, rawSslData } = details.current}
        <div>
            <span class="opacity-50 text-inline">
                <Icon icon="iconoir:globe" class="icon" />Domain Data:</span
            >
            <pre>
{formatJson(rawDomainData)}
            </pre>
        </div>
        <hr />

        {#if rawNsData}
            <div>
                <span class="opacity-50 text-inline">
                    <Icon icon="iconoir:dns" class="icon" />NS Data:</span
                >
                <pre>
{formatJson(rawNsData)}
                </pre>
            </div>
            <hr />
        {/if}

        {#if rawSslData}
            <div>
                <span class="opacity-50 text-inline">
                    <Icon icon="iconoir:security-pass" class="icon" />SSL Data:</span
                >
                <pre>
{formatJson(rawSslData)}
                </pre>
            </div>
            <hr />
        {/if}
    {/if}
{/snippet}

{#snippet otherButtons()}
    <div class="other">
        <span class="opacity-50">Options:</span>
        <div class="buttons">
            <form
                {...nsForm.enhance(async ({ submit }) => {
                    try {
                        if (await submit()) {
                            if (nsForm.result) toast.show(nsForm.result);
                        } else {
                            const issues = nsForm.fields.allIssues() ?? [];
                            toast.show({
                                status: 400,
                                message: issues
                                    .map((i) => i.message)
                                    .join(", "),
                            });
                        }
                    } catch (error) {
                        toast.show({
                            status: 500,
                            message: "Something went wrong",
                        });
                    }
                })}
            >
                <input {...nsForm.fields.domainId.as("hidden", data?.id)} />
                <Tooltip
                    text="Via Cloudflare DNS — free, no API key"
                    position="top"
                    offset={8}
                    hoverOpacity={false}
                    tabindex={isDemo() ? 0 : undefined}
                >
                    <Button
                        type="submit"
                        text="NS Lookup"
                        size="sm"
                        color="white"
                        ariaLabel="NS Lookup for {domainName}"
                        icon={isDemo()
                            ? "iconoir:dns"
                            : nsForm.pending
                              ? "iconoir:refresh-double"
                              : "iconoir:dns"}
                        iconClass={nsForm.pending ? "animate-spin" : ""}
                        disabled={isDemo() || !!nsForm.pending}
                    />
                </Tooltip>
            </form>
            <form
                {...sslForm.enhance(async ({ submit }) => {
                    try {
                        if (await submit()) {
                            if (sslForm.result) toast.show(sslForm.result);
                        } else {
                            const issues = sslForm.fields.allIssues() ?? [];
                            toast.show({
                                status: 400,
                                message: issues
                                    .map((i) => i.message)
                                    .join(", "),
                            });
                        }
                    } catch (error) {
                        toast.show({
                            status: 500,
                            message: "Something went wrong",
                        });
                    }
                })}
            >
                <input {...sslForm.fields.domainId.as("hidden", data?.id)} />

                {#if !isApiConfigured && !isDemo()}
                    <Tooltip
                        text="SSL checks run via WhoisJSON — add an API key in Settings"
                        position="top"
                        offset={8}
                        tabindex={0}
                    >
                        <Button
                            type="submit"
                            text="SSL Lookup"
                            size="sm"
                            color="white"
                            ariaLabel="SSL Lookup for {domainName}"
                            icon="iconoir:security-pass"
                            disabled={true}
                        />
                    </Tooltip>
                {:else}
                    <Tooltip
                        text="via WhoisJSON API"
                        position="top"
                        offset={8}
                        hoverOpacity={false}
                        tabindex={isDemo() ? 0 : undefined}
                    >
                        <Button
                            type="submit"
                            text="SSL Lookup"
                            size="sm"
                            color="white"
                            ariaLabel="SSL Lookup for {domainName}"
                            icon={isDemo()
                                ? "iconoir:security-pass"
                                : sslForm.pending
                                  ? "iconoir:refresh-double"
                                  : "iconoir:security-pass"}
                            iconClass={sslForm.pending ? "animate-spin" : ""}
                            disabled={isDemo() || !!sslForm.pending}
                        />
                    </Tooltip>
                {/if}
            </form>

            <form
                {...checkForm.enhance(async ({ submit }) => {
                    try {
                        if (await submit()) {
                            if (checkForm.result) toast.show(checkForm.result);
                        } else {
                            const issues = checkForm.fields.allIssues() ?? [];
                            toast.show({
                                status: 400,
                                message: issues
                                    .map((i) => i.message)
                                    .join(", "),
                            });
                        }
                    } catch (error) {
                        toast.show({
                            status: 500,
                            message: "Something went wrong",
                        });
                    }
                })}
            >
                <input {...checkForm.fields.domainId.as("hidden", data?.id)} />

                {#if scanTooltip}
                    <Tooltip
                        text={scanTooltip}
                        position="top"
                        offset={8}
                        hoverOpacity={false}
                        tabindex={isDemo() || scanBlocked ? 0 : undefined}
                    >
                        <Button
                            type="submit"
                            text="Scan Now"
                            size="sm"
                            color="white"
                            ariaLabel="Scan Now for {domainName}"
                            icon={isDemo()
                                ? "iconoir:search"
                                : checkForm.pending
                                  ? "iconoir:refresh-double"
                                  : "iconoir:search"}
                            iconClass={checkForm.pending ? "animate-spin" : ""}
                            disabled={isDemo() ||
                                !!checkForm.pending ||
                                scanBlocked}
                        />
                    </Tooltip>
                {:else}
                    <Button
                        type="submit"
                        text="Scan Now"
                        size="sm"
                        color="white"
                        ariaLabel="Scan Now for {domainName}"
                        icon={isDemo()
                            ? "iconoir:search"
                            : checkForm.pending
                              ? "iconoir:refresh-double"
                              : "iconoir:search"}
                        iconClass={checkForm.pending ? "animate-spin" : ""}
                        disabled={isDemo() || !!checkForm.pending}
                    />
                {/if}
            </form>
        </div>
    </div>
{/snippet}

{#snippet showStatus(domainStatus = "")}
    {#if domainStatus === DOMAIN_STATUS.AVAILABLE}
        <div class="status status--available">
            <Icon icon="iconoir:check" class="icon" />
        </div>
    {/if}
    {#if domainStatus === DOMAIN_STATUS.REGISTERED}
        {#if getExpirationStatus(data?.expires ?? null)?.isExpired || getExpirationStatus(data?.expires ?? null)?.isExpiringSoon}
            <div class="status-expiring-soon">
                <Icon icon="iconoir:warning-triangle-solid" class="icon" />
            </div>
        {:else}
            <div class="status status--not-available">
                <Icon icon="iconoir:xmark" class="icon" />
            </div>
        {/if}
    {/if}

    {#if domainStatus === DOMAIN_STATUS.NOT_CHECKED}
        <div class="status status--not-checked">
            <Icon icon="iconoir:search" class="icon" />
        </div>
    {/if}
    {#if domainStatus === DOMAIN_STATUS.ERROR}
        <div class="status status--unknown">
            <Icon icon="iconoir:question-mark" class="icon" />
        </div>
    {/if}
{/snippet}

{#snippet statusTextFormat(domainStatus = "")}
    {#if domainStatus === DOMAIN_STATUS.AVAILABLE}
        <div class="text-green">Available</div>
    {/if}
    {#if domainStatus === DOMAIN_STATUS.REGISTERED}
        <div class="text-red">Registered</div>
    {/if}
    {#if domainStatus === DOMAIN_STATUS.NOT_CHECKED}
        <div class="text-blue">Not Checked</div>
    {/if}
    {#if domainStatus === DOMAIN_STATUS.ERROR}
        <div class="text-orange-500 flex items-center gap-1">
            Unable to Verify
            {#if data?.error_message}
                <Tooltip
                    text={data.error_message}
                    position="bottom"
                    offset={8}
                    tabindex={0}
                >
                    <Icon icon="iconoir:info-circle" />
                </Tooltip>
            {/if}
        </div>
    {/if}
{/snippet}
