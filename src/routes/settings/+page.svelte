<script>
    import Button from "$components/Button.svelte";
    import Input from "$components/Input.svelte";
    import Tooltip from "$components/Tooltip.svelte";
    import { toast } from "$src/lib/stores/toast.svelte.js";
    import { slide } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { isDemo } from "$src/lib/utils/helpers.js";
    import {
        UI_DOMAIN_VIEW,
        DOMAIN_PROVIDER,
        WHOIS_JSON_API_STATUS,
        SLACK_CONNECTION_STATUS,
        DISCORD_CONNECTION_STATUS,
        RESEND_CONNECTION_STATUS,
    } from "$src/lib/constants/constants";
    import RadioButton from "$components/RadioButton.svelte";
    import ToggleSwitch from "$components/ToggleSwitch.svelte";
    import { page } from "$app/state";
    import { formatLastChecked } from "$src/lib/utils/helpers.js";
    import {
        saveApiKey,
        updateDomainProvider,
        updateUiView,
        updateSlackEnabled,
        updateSlackWebhook,
        updateDiscordEnabled,
        updateDiscordWebhook,
        updateResendEnabled,
        updateResendConfig,
    } from "$src/lib/remote/settings.remote";
    import {
        whoIsApiKeySchema,
        slackWebhookSchema,
        discordWebhookSchema,
        resendSchema,
    } from "./validation";

    //// PROPS ////
    /** @type {import('./$types').PageProps} */
    let { data } = $props();

    //// REMOTE FORMS ////
    // Seed the radio selections (as("radio") has no initial-value argument)
    // svelte-ignore state_referenced_locally
    updateUiView.fields.viewMode.set(data?.viewMode ?? UI_DOMAIN_VIEW.COMPACT);
    // svelte-ignore state_referenced_locally
    updateDomainProvider.fields.provider.set(
        data?.domainProvider ?? DOMAIN_PROVIDER.RDAP,
    );
    // Checkbox needs the same seed — remote-form field state is a module
    // singleton, so an unsaved toggle edit would otherwise survive navigation
    // svelte-ignore state_referenced_locally
    updateDomainProvider.fields.whoisjsonFallback.set(
        data?.whoisjsonFallback ?? true,
    );

    // Re-sync the radio/toggle when the RESOLVED values change mid-session —
    // saving a WhoisJSON key below flips the default from RDAP to WhoisJSON
    // via invalidateAll, but the one-shot seed above never re-runs.
    // svelte-ignore state_referenced_locally
    let lastResolvedProvider = data?.domainProvider;
    // svelte-ignore state_referenced_locally
    let lastResolvedFallback = data?.whoisjsonFallback;
    $effect(() => {
        const resolved = data?.domainProvider ?? DOMAIN_PROVIDER.RDAP;
        if (resolved !== lastResolvedProvider) {
            lastResolvedProvider = resolved;
            updateDomainProvider.fields.provider.set(resolved);
        }
        const resolvedFallback = data?.whoisjsonFallback ?? true;
        if (resolvedFallback !== lastResolvedFallback) {
            lastResolvedFallback = resolvedFallback;
            updateDomainProvider.fields.whoisjsonFallback.set(resolvedFallback);
        }
    });

    //// DOMAIN LOOKUP DERIVED STATE ////
    // Manual expand of the collapsed API-key summary ("Manage" button)
    let manageOpen = $state(false);

    const apiKeyConfigured = $derived(data?.apiKeyConfigured ?? false);
    const selectedProvider = $derived(
        updateDomainProvider.fields.provider.value() ??
            data?.domainProvider ??
            DOMAIN_PROVIDER.RDAP,
    );
    const fallbackEnabled = $derived(
        updateDomainProvider.fields.whoisjsonFallback.value() ??
            data?.whoisjsonFallback ??
            true,
    );
    // Auto-expand the API-key panel when WhoisJSON is selected or no key
    // exists yet; collapse to a compact summary otherwise, unless manually
    // opened
    const apiKeyPanelOpen = $derived(
        selectedProvider === DOMAIN_PROVIDER.WHOIS_JSON ||
            !apiKeyConfigured ||
            manageOpen,
    );

    // The fallback collapse wrapper may clip only while closed/animating — an
    // open panel must let the fallback tooltip overflow its edge (it renders
    // below the (i) icon and would otherwise be cut off). Initialized from
    // data because no transition fires on mount.
    // svelte-ignore state_referenced_locally
    let fallbackPanelSettled = $state(
        (data?.domainProvider ?? DOMAIN_PROVIDER.RDAP) ===
            DOMAIN_PROVIDER.RDAP,
    );
    $effect(() => {
        if (selectedProvider !== DOMAIN_PROVIDER.RDAP)
            fallbackPanelSettled = false;
    });

    /** Reverts the provider controls to the last persisted values */
    function revertDomainProvider() {
        updateDomainProvider.fields.provider.set(
            data?.domainProvider ?? DOMAIN_PROVIDER.RDAP,
        );
        updateDomainProvider.fields.whoisjsonFallback.set(
            data?.whoisjsonFallback ?? true,
        );
    }

    // Section visibility follows the live toggle state, falling back to the loaded value
    const slackEnabled = $derived(
        updateSlackEnabled.fields.enabled.value() ??
            data?.slackEnabled ??
            false,
    );
    const discordEnabled = $derived(
        updateDiscordEnabled.fields.enabled.value() ??
            data?.discordEnabled ??
            false,
    );
    const resendEnabled = $derived(
        updateResendEnabled.fields.enabled.value() ??
            data?.resendEnabled ??
            false,
    );

    /**
     * Shared enhance handler: submit, then toast the result on success.
     * Validation issues render inline below the inputs.
     * @param {{ submit: () => Promise<boolean>, readonly result: {status: number, message: string} | undefined }} form
     */
    async function submitWithToast(form) {
        try {
            if (await form.submit()) {
                if (form.result) toast.show(form.result);
            }
            // invalid data -> issues render inline
        } catch {
            toast.show({ status: 500, message: "Something went wrong" });
        }
    }

    /**
     * Submit handler for forms without inline issue rendering (toggles, uiView
     * radios) — validation issues surface as a toast instead. The optional
     * `revert` callback runs on any failure (validation, non-2xx result,
     * exception) so the control can snap back to the last persisted state.
     * @param {{ submit: () => Promise<boolean>, readonly result: {status: number, message: string} | undefined, fields: { allIssues: () => Array<{message: string}> | undefined } }} form
     * @param {() => void} [revert] - Restores the field to its persisted value
     */
    async function submitWithIssueToast(form, revert = undefined) {
        try {
            if (await form.submit()) {
                if (form.result) toast.show(form.result);
                if (
                    form.result &&
                    (form.result.status < 200 || form.result.status >= 300)
                ) {
                    revert?.();
                }
            } else {
                const issues = form.fields.allIssues() ?? [];
                toast.show({
                    status: 400,
                    message: issues.map((i) => i.message).join(", "),
                });
                revert?.();
            }
        } catch {
            toast.show({ status: 500, message: "Something went wrong" });
            revert?.();
        }
    }
</script>

<svelte:head>
    <title>Settings // Domain Watcher</title>
    <meta
        name="description"
        content="Manage Domain Watcher notification settings, configure Slack and email alerts for domain monitoring and status updates."
    />
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content={page?.url?.href} />
    <meta property="og:title" content="Settings // Domain Watcher" />
    <meta
        property="og:description"
        content="Manage Domain Watcher notification settings, configure Slack and email alerts for domain monitoring and status updates."
    />
    <meta property="og:image" content="{page?.url?.origin}/og_image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="Domain Watcher" />

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content={page?.url?.href} />
    <meta property="twitter:title" content="Settings // Domain Watcher" />
    <meta
        property="twitter:description"
        content="Manage Domain Watcher notification settings, configure Slack and email alerts for domain monitoring and status updates."
    />
    <meta property="twitter:image" content="{page?.url?.origin}/og_image.jpg" />
</svelte:head>

<div class="hero-section mt-16">
    <div class="grid gap-4 text-center">
        <h1>Settings</h1>
    </div>
</div>

<div class="max-w-3xl mx-auto mt-16 grid gap-2">
    <section class="card card--settings">
        <h2>Domain Lookup</h2>

        <div class="black-bg-card space-y-3">
            <h3>Domain Lookup Provider</h3>
            <p>
                Choose how domain availability and expiration data is fetched.
                RDAP queries the domain registries directly and is completely
                free; WhoisJSON uses your API key.
            </p>
            <!-- Provider options group: RDAP form + the self-contained
                 WhoisJSON box (one space-y unit for the parent) -->
            <div class="grid gap-3">
                <!-- Explicit save: changes are persisted by the external
                     "Save Changes" submitter below (form="" association) -->
                <form
                    id="domain-provider-form"
                    class="card--settings"
                    {...updateDomainProvider.enhance((form) =>
                        submitWithIssueToast(form, revertDomainProvider),
                    )}
                >
                    <!-- div (not label) wrapper: a label must not contain other
                     labelable controls like the fallback checkbox below -->
                    <div class="ui-view">
                        <RadioButton
                            id="provider-rdap"
                            {...updateDomainProvider.fields.provider.as(
                                "radio",
                                DOMAIN_PROVIDER.RDAP,
                            )}
                            disabled={isDemo() ||
                                !!updateDomainProvider.pending}
                            size="md"
                            variant="primary"
                            ariaLabel="Select RDAP provider"
                        />

                        <div class="view-card">
                            <label
                                for="provider-rdap"
                                class="grid gap-1 cursor-pointer"
                            >
                                <h4>RDAP (recommended)</h4>
                                <p>
                                    Free and no API key needed - fetches data
                                    straight from the domain registries.
                                </p>
                            </label>
                            <!-- Fallback only applies in RDAP mode. Animated
                             grid-rows collapse keeps the element in the DOM so
                             the checkbox still serializes into FormData on
                             save ({#if} removal or `disabled` would
                             silently flip the setting off); `inert` blocks
                             focus/clicks while collapsed -->
                            <div
                                class="grid transition-[grid-template-rows] duration-300 {selectedProvider ===
                                DOMAIN_PROVIDER.RDAP
                                    ? '[grid-template-rows:1fr]'
                                    : '[grid-template-rows:0fr]'}"
                                inert={selectedProvider !==
                                    DOMAIN_PROVIDER.RDAP}
                                ontransitionend={(e) => {
                                    if (
                                        e.propertyName === "grid-template-rows"
                                    )
                                        fallbackPanelSettled =
                                            selectedProvider ===
                                            DOMAIN_PROVIDER.RDAP;
                                }}
                            >
                                <div
                                    class="min-h-0 grid gap-1 {fallbackPanelSettled
                                        ? ''
                                        : 'overflow-hidden'}"
                                >
                                    <hr />
                                    <div
                                        class="flex justify-between items-center gap-2"
                                    >
                                        <h5
                                            class="text-sm font-medium flex items-center gap-1"
                                        >
                                            WhoisJSON Fallback
                                            <Tooltip
                                                text="Use WhoisJSON for TLDs without a public RDAP server (.eu, .co, .at, .it, .es, .us, .hr, .rs)."
                                                position="bottom"
                                            >
                                                <Icon
                                                    icon="iconoir:info-circle"
                                                    class="input__tooltip-icon"
                                                />
                                            </Tooltip>
                                        </h5>
                                        <ToggleSwitch
                                            id="whoisjson-fallback"
                                            size="sm"
                                            {...updateDomainProvider.fields.whoisjsonFallback.as(
                                                "checkbox",
                                                data?.whoisjsonFallback ?? true,
                                            )}
                                            ariaLabel="Allow WhoisJSON fallback"
                                            disabled={isDemo() ||
                                                !!updateDomainProvider.pending}
                                        />
                                    </div>
                                    <div class="response">
                                        {#if fallbackEnabled && apiKeyConfigured}
                                            <div class="status status--valid">
                                                <div class="icon"></div>
                                                TLDs without RDAP fall back to WhoisJSON
                                                (uses API quota)
                                            </div>
                                        {:else if fallbackEnabled}
                                            <div class="status status--invalid">
                                                <div class="icon"></div>
                                                No API key configured - domains on
                                                these TLDs will fail until you add
                                                one below
                                            </div>
                                        {:else}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Fallback disabled - domains on these
                                                TLDs will fail
                                            </div>
                                        {/if}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>

                <!-- TRUE single box: option row + API-key panel live in ONE
                     element with static borders (no jump by construction).
                     The radio sits outside the provider form: form=""
                     association covers FormData on save, and the manual
                     fields.provider.set() in onchange covers the live field
                     state the form's bubbling oninput would normally provide.
                     The saveApiKey form nests legally inside this div. -->
                <div class="ui-view flex-col gap-0!">
                    <div class="flex gap-2 w-full">
                        <RadioButton
                            id="provider-whoisjson"
                            {...updateDomainProvider.fields.provider.as(
                                "radio",
                                DOMAIN_PROVIDER.WHOIS_JSON,
                            )}
                            form="domain-provider-form"
                            onchange={() =>
                                updateDomainProvider.fields.provider.set(
                                    DOMAIN_PROVIDER.WHOIS_JSON,
                                )}
                            disabled={isDemo() ||
                                !!updateDomainProvider.pending}
                            size="md"
                            variant="primary"
                            ariaLabel="Select WhoisJSON provider"
                        />

                        <div class="view-card">
                            <div
                                class="flex items-center justify-between gap-2"
                            >
                                <label
                                    for="provider-whoisjson"
                                    class="flex items-center gap-2 flex-wrap cursor-pointer"
                                >
                                    <h4>WhoisJSON</h4>
                                    <div class="response">
                                        {#if !apiKeyConfigured}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Add API key first
                                            </div>
                                        {:else if data?.apiKeyConfig?.connection_status === WHOIS_JSON_API_STATUS.VALID}
                                            <div class="status status--valid">
                                                <div class="icon"></div>
                                                API key valid
                                            </div>
                                        {:else if data?.apiKeyConfig?.connection_status === WHOIS_JSON_API_STATUS.INVALID}
                                            <div class="status status--invalid">
                                                <div class="icon"></div>
                                                API key invalid
                                            </div>
                                        {/if}
                                    </div>
                                </label>
                            </div>
                            <label
                                for="provider-whoisjson"
                                class="cursor-pointer"
                            >
                                <p>
                                    Uses your WhoisJSON API key for all lookups
                                    (1000 free calls/month).
                                </p>
                            </label>
                        </div>
                        {#if apiKeyConfigured && selectedProvider !== DOMAIN_PROVIDER.WHOIS_JSON}
                            <div>
                                <Button
                                    type="button"
                                    text={manageOpen ? "Hide" : "Manage"}
                                    size="sm"
                                    color="black-outline"
                                    ariaLabel="Toggle WhoisJSON API key panel"
                                    icon="iconoir:nav-arrow-down"
                                    iconClass="transition-transform duration-300 {manageOpen
                                        ? 'rotate-180'
                                        : ''}"
                                    onclick={() => (manageOpen = !manageOpen)}
                                />
                            </div>
                        {/if}
                    </div>

                    {#if apiKeyPanelOpen}
                        <div
                            class="w-full grid gap-1 pl-8"
                            transition:slide={{ duration: 400 }}
                        >
                            <hr class="mt-4!" />
                            <form
                                class="grid gap-3"
                                {...saveApiKey
                                    .preflight(whoIsApiKeySchema)
                                    .enhance(submitWithToast)}
                                oninput={() =>
                                    saveApiKey.validate({
                                        preflightOnly: true,
                                    })}
                            >
                                <p>
                                    Used for WhoisJSON lookups, SSL certificate
                                    checks and as a fallback for TLDs without a
                                    public RDAP server. For registration and API
                                    key setup, visit:
                                    <a
                                        href="https://whoisjson.com"
                                        target="_blank"
                                        title="whoisjson.com"
                                        aria-label="whoisjson.com"
                                        >whoisjson.com</a
                                    >.
                                </p>
                                <Input
                                    type="text"
                                    id="apiKey"
                                    placeholder="Enter WhoisJSON API Key...."
                                    label="API Key"
                                    tooltip="Your WhoisJSON API key powers WhoisJSON lookups, SSL certificate checks and the RDAP fallback. Get your free API key at whoisjson.com"
                                    disabled={isDemo() || !!saveApiKey.pending}
                                    variant={saveApiKey.fields.apiKey.issues()
                                        ?.length
                                        ? "error"
                                        : "default"}
                                    helperText={saveApiKey.fields.apiKey.issues()?.[0]
                                        ?.message ?? ""}
                                    {...saveApiKey.fields.apiKey.as(
                                        "text",
                                        data?.apiKeyConfig?.api_key ?? "",
                                    )}
                                />
                                <div class="grid gap-0.5">
                                    <h6>
                                        Want to make sure everything’s working?
                                    </h6>
                                    <p>
                                        We’ll fetch the domain example.com as a
                                        test, so you can confirm everything is
                                        working properly.
                                    </p>
                                    <div class="warning">
                                        <Icon
                                            icon="iconoir:message-alert"
                                            class="icon"
                                        />
                                        <div>
                                            Testing will perform one request via
                                            the whoisjson.com API
                                        </div>
                                    </div>
                                </div>
                                <div class="save">
                                    <div class="space-y-0.5">
                                        <div class="response">
                                            <div class="text">API Status:</div>
                                            {#if data?.apiKeyConfig?.connection_status === WHOIS_JSON_API_STATUS.VALID}
                                                <div
                                                    class="status status--valid"
                                                >
                                                    <div class="icon"></div>
                                                    Connected and verified
                                                </div>
                                            {:else if data?.apiKeyConfig?.connection_status === WHOIS_JSON_API_STATUS.INVALID}
                                                <div
                                                    class="status status--invalid"
                                                >
                                                    <div class="icon"></div>
                                                    Invalid API key
                                                </div>
                                            {:else if data?.apiKeyConfig?.connection_status === WHOIS_JSON_API_STATUS.NOT_CONFIGURED}
                                                <div
                                                    class="status status--unknown"
                                                >
                                                    <div class="icon"></div>
                                                    Please configure your API key
                                                </div>
                                            {:else}
                                                <div
                                                    class="status status--unknown"
                                                >
                                                    <div class="icon"></div>
                                                    Status unknown
                                                </div>
                                            {/if}
                                        </div>
                                        <div class="response">
                                            <p class="text">
                                                Last verified: <span
                                                    class="italic"
                                                >
                                                    {formatLastChecked(
                                                        data?.apiKeyConfig
                                                            ?.connection_verified_at ??
                                                            null,
                                                    ) || "Never"}</span
                                                >
                                            </p>
                                        </div>
                                    </div>

                                    <Button
                                        type="submit"
                                        text="Test & Save API Key"
                                        size="md"
                                        color="white"
                                        ariaLabel="Test & Save API Key"
                                        icon={isDemo()
                                            ? "iconoir:save-floppy-disk"
                                            : saveApiKey.pending
                                              ? "iconoir:refresh-double"
                                              : "iconoir:save-floppy-disk"}
                                        iconClass={saveApiKey.pending
                                            ? "animate-spin"
                                            : ""}
                                        disabled={isDemo() ||
                                            !!saveApiKey.pending}
                                    />
                                </div>
                            </form>
                        </div>
                    {/if}
                </div>
            </div>

            <hr />
            <div class="flex justify-between items-center gap-2">
                <p>Provider and fallback changes are applied when you save.</p>
                <!-- External submitter for #domain-provider-form (the panel
                     form sits between the provider form and this row, so the
                     button associates via the native form attribute) -->
                <Button
                    type="submit"
                    form="domain-provider-form"
                    text="Save Changes"
                    size="md"
                    color="white"
                    ariaLabel="Save Changes"
                    icon={isDemo()
                        ? "iconoir:save-floppy-disk"
                        : updateDomainProvider.pending
                          ? "iconoir:refresh-double"
                          : "iconoir:save-floppy-disk"}
                    iconClass={updateDomainProvider.pending
                        ? "animate-spin"
                        : ""}
                    disabled={isDemo() || !!updateDomainProvider.pending}
                />
            </div>
        </div>
    </section>

    <section class="card card--settings">
        <h2>General</h2>

        <div class="black-bg-card space-y-3">
            <h3>Domain List View</h3>
            <p>
                Choose how domain information is displayed in your list. You can
                opt for a compact view or a detailed view with full domain data.
            </p>
            <form
                class="card--settings"
                {...updateUiView.enhance((form) =>
                    submitWithIssueToast(form, () =>
                        updateUiView.fields.viewMode.set(
                            data?.viewMode ?? UI_DOMAIN_VIEW.COMPACT,
                        ),
                    ),
                )}
            >
                <label for="compact-view" class="ui-view">
                    <RadioButton
                        id="compact-view"
                        {...updateUiView.fields.viewMode.as(
                            "radio",
                            UI_DOMAIN_VIEW.COMPACT,
                        )}
                        disabled={isDemo() || !!updateUiView.pending}
                        size="md"
                        variant="primary"
                        ariaLabel="Select compact view"
                    />

                    <div class="view-card">
                        <h4>Compact View</h4>
                        <p>
                            Only shows domain name and availability status -
                            ideal for a clean, minimal overview
                        </p>
                        <div class="domain-card">
                            <div class="row">
                                <div class="left">
                                    <div class="size-5"></div>
                                    <div class="h-3 w-14 sm:w-40 md:w-52"></div>
                                </div>
                                <div class="right">
                                    <div class="h-4 w-12"></div>
                                    <div class="size-4"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </label>
                <label for="detailed-view" class="ui-view">
                    <RadioButton
                        id="detailed-view"
                        {...updateUiView.fields.viewMode.as(
                            "radio",
                            UI_DOMAIN_VIEW.DETAILED,
                        )}
                        disabled={isDemo() || !!updateUiView.pending}
                        size="md"
                        variant="primary"
                        ariaLabel="Select detailed view"
                    />

                    <div class="view-card">
                        <h4>Detailed View</h4>
                        <p>
                            Displays full domain details, including registrar
                            and expiration date - perfect for deeper monitoring
                        </p>
                        <div class="domain-card">
                            <div class="row">
                                <div class="left">
                                    <div class="size-5"></div>
                                    <div class="h-3 w-14 sm:w-40 md:w-52"></div>
                                </div>
                                <div class="right">
                                    <div class="h-4 w-12"></div>
                                    <div class="size-4"></div>
                                </div>
                            </div>
                            {#each Array(4) as _, i (i)}
                                <hr />
                                <div class="row">
                                    <div class="left">
                                        <div class="h-3 w-36"></div>
                                    </div>
                                </div>
                            {/each}
                        </div>
                    </div>
                </label>
                <hr />
                <div class="buttons">
                    <Button
                        type="button"
                        text="Reset to Default"
                        size="md"
                        color="black-outline"
                        ariaLabel="Reset to Default"
                        class="hidden! md:flex!"
                        disabled={isDemo() || !!updateUiView.pending}
                        onclick={() => {
                            updateUiView.fields.viewMode.set(
                                UI_DOMAIN_VIEW.COMPACT,
                            );
                        }}
                    />
                    <Button
                        type="submit"
                        text="Save Changes"
                        size="md"
                        color="white"
                        ariaLabel="Save Changes"
                        icon={isDemo()
                            ? "iconoir:save-floppy-disk"
                            : updateUiView.pending
                              ? "iconoir:refresh-double"
                              : "iconoir:save-floppy-disk"}
                        iconClass={updateUiView.pending ? "animate-spin" : ""}
                        disabled={isDemo() || !!updateUiView.pending}
                    />
                </div>
            </form>
        </div>
    </section>

    <section class="card card--settings">
        <h2>Notifications</h2>
        <p>
            Stay informed about your domain status with automated notifications.
            Choose from multiple notification channels and receive daily updates
            about domain availability and expiration alerts.
        </p>

        <div class="black-bg-card">
            <form {...updateSlackEnabled}>
                <label for="slack" class="space-y-1">
                    <div class="flex justify-between items-center">
                        <h3>Slack</h3>
                        <ToggleSwitch
                            id="slack"
                            {...updateSlackEnabled.fields.enabled.as(
                                "checkbox",
                                data?.slackEnabled ?? false,
                            )}
                            ariaLabel="Enable notifications"
                            disabled={isDemo() || !!updateSlackEnabled.pending}
                            onchange={() =>
                                submitWithIssueToast(updateSlackEnabled, () =>
                                    updateSlackEnabled.fields.enabled.set(
                                        data?.slackEnabled ?? false,
                                    ),
                                )}
                        />
                    </div>
                    <p>
                        Connect your Slack workspace to receive domain
                        notifications directly in your channels. You'll need to
                        create a Slack app and generate a webhook URL first. For
                        detailed instructions, follow this link: <a
                            href="https://api.slack.com/messaging/webhooks"
                            target="_blank"
                            title="Slack Webhooks Guide"
                            aria-label="Slack Webhooks Guide"
                            >Slack Webhooks Guide</a
                        >.
                    </p>
                </label>
            </form>
            {#if slackEnabled}
                <form
                    {...updateSlackWebhook
                        .preflight(slackWebhookSchema)
                        .enhance(submitWithToast)}
                    oninput={() =>
                        updateSlackWebhook.validate({ preflightOnly: true })}
                >
                    <div
                        class="grid gap-3"
                        transition:slide={{ duration: 600 }}
                    >
                        <hr class="mt-5!" />

                        <Input
                            type="text"
                            id="webhook"
                            placeholder="Enter Slack Webhook Url...."
                            label="Webhook"
                            tooltip="Your Slack Webhook URL for sending notifications. Create one in your Slack app settings. Example: https://hooks.slack.com/services/T05Q..."
                            disabled={isDemo() || !!updateSlackWebhook.pending}
                            variant={updateSlackWebhook.fields.webhook.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateSlackWebhook.fields.webhook.issues()?.[0]
                                ?.message ?? ""}
                            {...updateSlackWebhook.fields.webhook.as(
                                "text",
                                data?.slackWebhookConfig?.webhook_url ?? "",
                            )}
                        />
                        <Input
                            id="notificationTime"
                            placeholder="Enter Slack Webhook Url...."
                            label="Notification time"
                            tooltip="Time for daily domain alerts - available domains and those expiring within 30 days."
                            disabled={isDemo() || !!updateSlackWebhook.pending}
                            variant={updateSlackWebhook.fields.notificationTime.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            class="max-w-40"
                            helperText={updateSlackWebhook.fields.notificationTime.issues()?.[0]
                                ?.message ?? ""}
                            {...updateSlackWebhook.fields.notificationTime.as(
                                "time",
                                data?.slackWebhookConfig?.notification_time ??
                                    "",
                            )}
                        />
                        <div class="test">
                            <div class="grid gap-0.5">
                                <h6>Want to make sure everything’s working?</h6>
                                <p>
                                    We’ll send a quick test message to your
                                    Slack channel so you can confirm the
                                    connection.
                                </p>
                            </div>
                            <div class="save">
                                <div class="space-y-0.5">
                                    <div class="response">
                                        <div class="text">Status:</div>
                                        {#if data?.slackWebhookConfig?.connection_status === SLACK_CONNECTION_STATUS.CONNECTED}
                                            <div class="status status--valid">
                                                <div class="icon"></div>
                                                Connected and verified
                                            </div>
                                        {:else if data?.slackWebhookConfig?.connection_status === SLACK_CONNECTION_STATUS.DISCONNECTED}
                                            <div class="status status--invalid">
                                                <div class="icon"></div>
                                                Connection failed
                                            </div>
                                        {:else if data?.slackWebhookConfig?.connection_status === SLACK_CONNECTION_STATUS.SETUP_REQUIRED}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Setup required - Add your Webhook
                                                URL
                                            </div>
                                        {:else if data?.slackWebhookConfig?.connection_status === SLACK_CONNECTION_STATUS.READY}
                                            <div class="status status--ready">
                                                <div class="icon"></div>
                                                Ready for testing
                                            </div>
                                        {:else}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Status unknown
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="response">
                                        <p class="text">
                                            Last verified: <span class="italic">
                                                {formatLastChecked(
                                                    data?.slackWebhookConfig
                                                        ?.connection_verified_at ??
                                                        null,
                                                ) || "Never"}</span
                                            >
                                        </p>
                                    </div>
                                </div>

                                <ToggleSwitch
                                    id="sendSlackTestMessage"
                                    {...updateSlackWebhook.fields.sendTestMessage.as(
                                        "checkbox",
                                    )}
                                    ariaLabel="Send Test Message"
                                    disabled={isDemo() ||
                                        !!updateSlackWebhook.pending}
                                />
                            </div>
                        </div>
                        <hr />
                        <div class="flex justify-end">
                            <Button
                                type="submit"
                                text={updateSlackWebhook.fields.sendTestMessage.value()
                                    ? "Test & Save Slack Changes"
                                    : "Save Changes"}
                                size="md"
                                color="white"
                                ariaLabel={updateSlackWebhook.fields.sendTestMessage.value()
                                    ? "Test & Save Slack Changes"
                                    : "Save Slack Changes"}
                                icon={isDemo()
                                    ? updateSlackWebhook.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"
                                    : updateSlackWebhook.pending
                                      ? "iconoir:refresh-double"
                                      : updateSlackWebhook.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"}
                                iconClass={updateSlackWebhook.pending
                                    ? "animate-spin"
                                    : ""}
                                disabled={isDemo() ||
                                    !!updateSlackWebhook.pending}
                            />
                        </div>
                    </div>
                </form>
            {/if}
        </div>

        <div class="black-bg-card">
            <form {...updateDiscordEnabled}>
                <label for="discord" class="space-y-1">
                    <div class="flex justify-between items-center">
                        <h3>Discord</h3>
                        <ToggleSwitch
                            id="discord"
                            {...updateDiscordEnabled.fields.enabled.as(
                                "checkbox",
                                data?.discordEnabled ?? false,
                            )}
                            ariaLabel="Enable notifications"
                            disabled={isDemo() ||
                                !!updateDiscordEnabled.pending}
                            onchange={() =>
                                submitWithIssueToast(updateDiscordEnabled, () =>
                                    updateDiscordEnabled.fields.enabled.set(
                                        data?.discordEnabled ?? false,
                                    ),
                                )}
                        />
                    </div>
                    <p>
                        Connect your Discord server to receive domain
                        notifications directly in your channels. Create a
                        webhook in your channel settings (Integrations →
                        Webhooks). For detailed instructions, follow this link: <a
                            href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
                            target="_blank"
                            title="Discord Webhooks Guide"
                            aria-label="Discord Webhooks Guide"
                            >Discord Webhooks Guide</a
                        >.
                    </p>
                </label>
            </form>
            {#if discordEnabled}
                <form
                    {...updateDiscordWebhook
                        .preflight(discordWebhookSchema)
                        .enhance(submitWithToast)}
                    oninput={() =>
                        updateDiscordWebhook.validate({ preflightOnly: true })}
                >
                    <div
                        class="grid gap-3"
                        transition:slide={{ duration: 600 }}
                    >
                        <hr class="mt-5!" />

                        <Input
                            type="text"
                            id="discordWebhook"
                            placeholder="Enter Discord Webhook Url...."
                            label="Webhook"
                            tooltip="Your Discord Webhook URL for sending notifications. Create one in your channel settings under Integrations → Webhooks. Example: https://discord.com/api/webhooks/1234..."
                            disabled={isDemo() || !!updateDiscordWebhook.pending}
                            variant={updateDiscordWebhook.fields.webhook.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateDiscordWebhook.fields.webhook.issues()?.[0]
                                ?.message ?? ""}
                            {...updateDiscordWebhook.fields.webhook.as(
                                "text",
                                data?.discordWebhookConfig?.webhook_url ?? "",
                            )}
                        />
                        <Input
                            id="discordNotificationTime"
                            placeholder="Enter Notification Time...."
                            label="Notification time"
                            tooltip="Time for daily domain alerts - available domains and those expiring within 30 days."
                            disabled={isDemo() || !!updateDiscordWebhook.pending}
                            variant={updateDiscordWebhook.fields.notificationTime.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            class="max-w-40"
                            helperText={updateDiscordWebhook.fields.notificationTime.issues()?.[0]
                                ?.message ?? ""}
                            {...updateDiscordWebhook.fields.notificationTime.as(
                                "time",
                                data?.discordWebhookConfig
                                    ?.notification_time ?? "",
                            )}
                        />
                        <div class="test">
                            <div class="grid gap-0.5">
                                <h6>Want to make sure everything’s working?</h6>
                                <p>
                                    We’ll send a quick test message to your
                                    Discord channel so you can confirm the
                                    connection.
                                </p>
                            </div>
                            <div class="save">
                                <div class="space-y-0.5">
                                    <div class="response">
                                        <div class="text">Status:</div>
                                        {#if data?.discordWebhookConfig?.connection_status === DISCORD_CONNECTION_STATUS.CONNECTED}
                                            <div class="status status--valid">
                                                <div class="icon"></div>
                                                Connected and verified
                                            </div>
                                        {:else if data?.discordWebhookConfig?.connection_status === DISCORD_CONNECTION_STATUS.DISCONNECTED}
                                            <div class="status status--invalid">
                                                <div class="icon"></div>
                                                Connection failed
                                            </div>
                                        {:else if data?.discordWebhookConfig?.connection_status === DISCORD_CONNECTION_STATUS.SETUP_REQUIRED}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Setup required - Add your Webhook
                                                URL
                                            </div>
                                        {:else if data?.discordWebhookConfig?.connection_status === DISCORD_CONNECTION_STATUS.READY}
                                            <div class="status status--ready">
                                                <div class="icon"></div>
                                                Ready for testing
                                            </div>
                                        {:else}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Status unknown
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="response">
                                        <p class="text">
                                            Last verified: <span class="italic">
                                                {formatLastChecked(
                                                    data?.discordWebhookConfig
                                                        ?.connection_verified_at ??
                                                        null,
                                                ) || "Never"}</span
                                            >
                                        </p>
                                    </div>
                                </div>

                                <ToggleSwitch
                                    id="sendDiscordTestMessage"
                                    {...updateDiscordWebhook.fields.sendTestMessage.as(
                                        "checkbox",
                                    )}
                                    ariaLabel="Send Test Message"
                                    disabled={isDemo() ||
                                        !!updateDiscordWebhook.pending}
                                />
                            </div>
                        </div>
                        <hr />
                        <div class="flex justify-end">
                            <Button
                                type="submit"
                                text={updateDiscordWebhook.fields.sendTestMessage.value()
                                    ? "Test & Save Discord Changes"
                                    : "Save Changes"}
                                size="md"
                                color="white"
                                ariaLabel={updateDiscordWebhook.fields.sendTestMessage.value()
                                    ? "Test & Save Discord Changes"
                                    : "Save Discord Changes"}
                                icon={isDemo()
                                    ? updateDiscordWebhook.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"
                                    : updateDiscordWebhook.pending
                                      ? "iconoir:refresh-double"
                                      : updateDiscordWebhook.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"}
                                iconClass={updateDiscordWebhook.pending
                                    ? "animate-spin"
                                    : ""}
                                disabled={isDemo() ||
                                    !!updateDiscordWebhook.pending}
                            />
                        </div>
                    </div>
                </form>
            {/if}
        </div>

        <div class="black-bg-card">
            <form {...updateResendEnabled}>
                <label for="resend" class="space-y-1">
                    <div class="flex justify-between items-center">
                        <h3>Resend</h3>
                        <ToggleSwitch
                            id="resend"
                            {...updateResendEnabled.fields.enabled.as(
                                "checkbox",
                                data?.resendEnabled ?? false,
                            )}
                            ariaLabel="Enable notifications"
                            disabled={isDemo() || !!updateResendEnabled.pending}
                            onchange={() =>
                                submitWithIssueToast(updateResendEnabled, () =>
                                    updateResendEnabled.fields.enabled.set(
                                        data?.resendEnabled ?? false,
                                    ),
                                )}
                        />
                    </div>
                    <p>
                        Connect your Resend account to receive domain
                        notifications directly via email. You’ll need to create
                        an API key in your Resend dashboard first. For detailed
                        instructions, follow this link: <a
                            href="https://resend.com/docs/dashboard/api-keys/introduction"
                            target="_blank"
                            title="Resend API Documentation"
                            aria-label="Resend API Documentation"
                            >Resend API Documentation</a
                        >.
                    </p>
                </label>
            </form>

            {#if resendEnabled}
                <form
                    {...updateResendConfig
                        .preflight(resendSchema)
                        .enhance(submitWithToast)}
                    oninput={() =>
                        updateResendConfig.validate({ preflightOnly: true })}
                >
                    <div
                        class="grid gap-3"
                        transition:slide={{ duration: 600 }}
                    >
                        <hr class="mt-5!" />

                        <Input
                            type="text"
                            id="resendApiKey"
                            placeholder="Enter Resend API Key...."
                            label="API Key"
                            tooltip="Your Resend API key for sending emails. Get one from your Resend dashboard at resend.com. Example: re_AbCdE******"
                            disabled={isDemo() || !!updateResendConfig.pending}
                            variant={updateResendConfig.fields.apiKey.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateResendConfig.fields.apiKey.issues()?.[0]
                                ?.message ?? ""}
                            {...updateResendConfig.fields.apiKey.as(
                                "text",
                                data?.resendConfig?.api_key ?? "",
                            )}
                        />

                        <Input
                            type="text"
                            id="fromEmail"
                            placeholder="Enter From Email..."
                            label="From Email"
                            tooltip="The sender email address that notifications will come from. Must be a verified domain in your Resend account. Example: notifications@yourdomain.com"
                            disabled={isDemo() || !!updateResendConfig.pending}
                            variant={updateResendConfig.fields.fromEmail.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateResendConfig.fields.fromEmail.issues()?.[0]
                                ?.message ?? ""}
                            {...updateResendConfig.fields.fromEmail.as(
                                "text",
                                data?.resendConfig?.from_email ?? "",
                            )}
                        />

                        <Input
                            type="text"
                            id="toEmail"
                            placeholder="Enter To Email..."
                            label="To Email"
                            tooltip="The recipient email address where domain monitoring notifications will be sent. This should be your admin or notification email. Example: admin@yourdomain.com"
                            disabled={isDemo() || !!updateResendConfig.pending}
                            variant={updateResendConfig.fields.toEmail.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            helperText={updateResendConfig.fields.toEmail.issues()?.[0]
                                ?.message ?? ""}
                            {...updateResendConfig.fields.toEmail.as(
                                "text",
                                data?.resendConfig?.to_email ?? "",
                            )}
                        />

                        <Input
                            id="resendNotificationTime"
                            placeholder="Enter Notification Time...."
                            label="Notification time"
                            tooltip="Time for daily domain alerts - available domains and those expiring within 30 days."
                            disabled={isDemo() || !!updateResendConfig.pending}
                            variant={updateResendConfig.fields.notificationTime.issues()
                                ?.length
                                ? "error"
                                : "default"}
                            class="max-w-40"
                            helperText={updateResendConfig.fields.notificationTime.issues()?.[0]
                                ?.message ?? ""}
                            {...updateResendConfig.fields.notificationTime.as(
                                "time",
                                data?.resendConfig?.notification_time ?? "",
                            )}
                        />

                        <div class="test">
                            <div class="grid gap-0.5">
                                <h6>Want to make sure everything’s working?</h6>
                                <p>
                                    We'll send a quick test email to confirm
                                    your setup is working and ready for
                                    notifications.
                                </p>
                            </div>
                            <div class="save">
                                <div class="space-y-0.5">
                                    <div class="response">
                                        <div class="text">Status:</div>
                                        {#if data?.resendConfig?.connection_status === RESEND_CONNECTION_STATUS.CONNECTED}
                                            <div class="status status--valid">
                                                <div class="icon"></div>
                                                Connected and verified
                                            </div>
                                        {:else if data?.resendConfig?.connection_status === RESEND_CONNECTION_STATUS.DISCONNECTED}
                                            <div class="status status--invalid">
                                                <div class="icon"></div>
                                                Connection failed
                                            </div>
                                        {:else if data?.resendConfig?.connection_status === RESEND_CONNECTION_STATUS.SETUP_REQUIRED}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Setup required - Add your Resend
                                                Config
                                            </div>
                                        {:else if data?.resendConfig?.connection_status === RESEND_CONNECTION_STATUS.READY}
                                            <div class="status status--ready">
                                                <div class="icon"></div>
                                                Ready for testing
                                            </div>
                                        {:else}
                                            <div class="status status--unknown">
                                                <div class="icon"></div>
                                                Status unknown
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="response">
                                        <p class="text">
                                            Last verified: <span class="italic">
                                                {formatLastChecked(
                                                    data?.resendConfig
                                                        ?.connection_verified_at ??
                                                        null,
                                                ) || "Never"}</span
                                            >
                                        </p>
                                    </div>
                                </div>

                                <ToggleSwitch
                                    id="sendResendTestMessage"
                                    {...updateResendConfig.fields.sendTestMessage.as(
                                        "checkbox",
                                    )}
                                    ariaLabel="Send Test Message"
                                    disabled={isDemo() ||
                                        !!updateResendConfig.pending}
                                />
                            </div>
                        </div>
                        <hr />
                        <div class="flex justify-end">
                            <Button
                                type="submit"
                                text={updateResendConfig.fields.sendTestMessage.value()
                                    ? "Test & Save Resend Changes"
                                    : "Save Changes"}
                                size="md"
                                color="white"
                                ariaLabel={updateResendConfig.fields.sendTestMessage.value()
                                    ? "Test & Save Resend"
                                    : "Save Resend Changes"}
                                icon={isDemo()
                                    ? updateResendConfig.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"
                                    : updateResendConfig.pending
                                      ? "iconoir:refresh-double"
                                      : updateResendConfig.fields.sendTestMessage.value()
                                        ? "iconoir:send-diagonal"
                                        : "iconoir:save-floppy-disk"}
                                iconClass={updateResendConfig.pending
                                    ? "animate-spin"
                                    : ""}
                                disabled={isDemo() ||
                                    !!updateResendConfig.pending}
                            />
                        </div>
                    </div>
                </form>
            {/if}
        </div>
    </section>
</div>
