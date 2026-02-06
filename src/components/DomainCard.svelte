<script>
    import Button from "$components/Button.svelte";
    import Icon from "@iconify/svelte";
    import { slide, fly } from "svelte/transition";
    import { UI_DOMAIN_VIEW } from "$lib/constants/constants";
    import { DOMAIN_STATUS } from "$src/lib/constants/constants";
    import { isDemo } from "$src/lib/utils/helpers";
    import Tooltip from "$components/Tooltip.svelte";
    import { toast } from "$src/lib/stores/toast.svelte.js";
    import {
        formatHumanDate,
        formatExpirationDate,
        formatLastChecked,
        getExpirationStatus,
    } from "$src/lib/utils/helpers";
    import { ssl, ns, check, remove } from "$src/lib/remote/domain-card.remote";

    //// PROPS ////
    let { data, uiView } = $props();

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
     * Get button icon with rotation based on expansion state
     */
    const buttonIcon = $derived("iconoir:nav-arrow-up");
    const buttonIconClass = $derived(
        `transition-all duration-200 ease-in-out ${isExpanded ? "rotate-180" : ""}`,
    );
</script>

<div class="card card--domain">
    <div class="main-content">
        <div class="main-info">
            <div class="icon-status">
                <Icon icon="iconoir:globe" class="icon-globe" />
                {@render showStatus(data?.status ?? 4)}
            </div>

            <h3>{data?.domain_name || "Error"}</h3>
            {#if data?.status === DOMAIN_STATUS.NOT_CHECKED}
                <Tooltip
                    text="Domains added to watchlist aren't auto-checked. Click 'Check Domains' for batch verification or use 'Scan Now' for individual verification."
                    position="bottom"
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
                        ariaLabel={buttonText}
                    />

                    <Button
                        type="button"
                        size="md"
                        iconClass="text-red"
                        icon="iconoir:trash"
                        color="white"
                        onclick={showDeleteDialog}
                        ariaLabel="Are you sure you want to delete this domain?"
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
                        ariaLabel="Cancel"
                    />

                    <form
                        {...removeForm.enhance(async ({ submit }) => {
                            try {
                                await submit();

                                const issues =
                                    removeForm.fields.allIssues() ?? [];
                                if (issues.length > 0) {
                                    toast.show({
                                        status: 400,
                                        message: issues
                                            .map((i) => i.message)
                                            .join(", "),
                                    });
                                } else {
                                    toast.show(removeForm?.result);
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
                            readonly
                        />
                        {#if isDemo()}
                            <Button
                                type="button"
                                text="Delete"
                                size="md"
                                icon="iconoir:trash"
                                color="black"
                                class="button--red "
                                ariaLabel="Delete domain"
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
                                ariaLabel="Delete domain"
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
        {formatExpirationDate(data?.expires, {
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
        {formatLastChecked(data?.last_domain_checked) || "Never"}
    </p>
    <hr />
    <p class="inline">
        <span class="opacity-50">Added At:</span>
        {formatHumanDate(data?.created_at) || "/"}
    </p>
    <hr />
    <div>
        <span class="opacity-50 text-inline">
            <Icon icon="iconoir:globe" class="icon" />Domain Data:</span
        >
        <pre>
{JSON.stringify(JSON.parse(data?.raw_domain_data || "{}"), null, 2)}
        </pre>
    </div>
    <hr />

    {#if data?.raw_ns_data && data.raw_ns_data !== "{}" && data.raw_ns_data !== "null"}
        <div>
            <span class="opacity-50 text-inline">
                <Icon icon="iconoir:dns" class="icon" />NS Data:</span
            >
            <pre>
{JSON.stringify(JSON.parse(data.raw_ns_data), null, 2)}
            </pre>
        </div>
        <hr />
    {/if}

    {#if data?.raw_ssl_data && data.raw_ssl_data !== "{}" && data.raw_ssl_data !== "null"}
        <div>
            <span class="opacity-50 text-inline">
                <Icon icon="iconoir:security-pass" class="icon" />SSL Data:</span
            >
            <pre>
{JSON.stringify(JSON.parse(data.raw_ssl_data), null, 2)}
            </pre>
        </div>
        <hr />
    {/if}

    {@render otherButtons()}
{/snippet}

{#snippet otherButtons()}
    <div class="other">
        <span class="opacity-50">Options:</span>
        <div class="buttons">
            <form
                {...nsForm.enhance(async ({ submit }) => {
                    try {
                        await submit();

                        const issues = nsForm.fields.allIssues() ?? [];
                        if (issues.length > 0) {
                            toast.show({
                                status: 400,
                                message: issues
                                    .map((i) => i.message)
                                    .join(", "),
                            });
                        } else {
                            toast.show(nsForm?.result);
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
                    {...nsForm.fields.domainId.as("hidden", data?.id)}
                    readonly
                />
                <Button
                    type={isDemo() ? "button" : "submit"}
                    text="NS Lookup"
                    size="sm"
                    color="white"
                    ariaLabel="NS Lookup - Check"
                    icon={isDemo()
                        ? "iconoir:dns"
                        : nsForm.pending
                          ? "iconoir:refresh-double"
                          : "iconoir:dns"}
                    iconClass={nsForm.pending ? "animate-spin" : ""}
                    disabled={isDemo() || !!nsForm.pending}
                />
            </form>
            <form
                {...sslForm.enhance(async ({ submit }) => {
                    try {
                        await submit();

                        const issues = sslForm.fields.allIssues() ?? [];
                        if (issues.length > 0) {
                            toast.show({
                                status: 400,
                                message: issues
                                    .map((i) => i.message)
                                    .join(", "),
                            });
                        } else {
                            toast.show(sslForm?.result);
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
                    {...sslForm.fields.domainId.as("hidden", data?.id)}
                    readonly
                />

                <Button
                    type={isDemo() ? "button" : "submit"}
                    text="SSL Lookup"
                    size="sm"
                    color="white"
                    ariaLabel="SSL Lookup - Check"
                    icon={isDemo()
                        ? "iconoir:security-pass"
                        : sslForm.pending
                          ? "iconoir:refresh-double"
                          : "iconoir:security-pass"}
                    iconClass={sslForm.pending ? "animate-spin" : ""}
                    disabled={isDemo() || !!sslForm.pending}
                />
            </form>

            <form
                {...checkForm.enhance(async ({ submit }) => {
                    try {
                        await submit();

                        const issues = checkForm.fields.allIssues() ?? [];
                        if (issues.length > 0) {
                            toast.show({
                                status: 400,
                                message: issues
                                    .map((i) => i.message)
                                    .join(", "),
                            });
                        } else {
                            toast.show(checkForm?.result);
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
                    {...checkForm.fields.domainId.as("hidden", data?.id)}
                    readonly
                />

                <Button
                    type={isDemo() ? "button" : "submit"}
                    text="Scan Now"
                    size="sm"
                    color="white"
                    ariaLabel="Scan domain for latest status and details"
                    icon={isDemo()
                        ? "iconoir:search"
                        : checkForm.pending
                          ? "iconoir:refresh-double"
                          : "iconoir:search"}
                    iconClass={checkForm.pending ? "animate-spin" : ""}
                    disabled={isDemo() || !!checkForm.pending}
                />
            </form>
        </div>
    </div>
{/snippet}

{#snippet showStatus(domainStatus)}
    {#if domainStatus === DOMAIN_STATUS.AVAILABLE}
        <div class="status status--available">
            <Icon icon="iconoir:check" class="icon" />
        </div>
    {/if}
    {#if domainStatus === DOMAIN_STATUS.REGISTERED}
        {#if getExpirationStatus(data?.expires)?.isExpired || getExpirationStatus(data?.expires)?.isExpiringSoon}
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

{#snippet statusTextFormat(domainStatus)}
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
        <div class="text-orange-500">
            Unable to Verify — <i>{data?.error_message}</i>
        </div>
    {/if}
{/snippet}
