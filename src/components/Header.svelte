<script>
    import { PUBLIC_ENVIRONMENT } from "$app/env/public";
    import { resolve } from "$app/paths";
    import Button from "./Button.svelte";
    import EnvTag from "./EnvTag.svelte";
    import Icon from "@iconify/svelte";
    import Tooltip from "./Tooltip.svelte";
    import { theme } from "#lib/stores/theme.svelte.js";
    import { toast } from "#lib/stores/toast.svelte.js";
    import { isDemo } from "#lib/utils/helpers.js";
    import { batchCheck } from "#lib/remote/check-domains.remote.js";

    /**
     * App header with per-page layout configuration and batch check action
     * @typedef {Object} Props
     * @property {string} [type="default"] - Header layout type (main, settings, default)
     * @property {boolean} [isLookupReady=false] - Whether domain lookups can run (RDAP selected, or WhoisJSON with a configured key)
     */

    /** @type {Props} */
    let { type = "default", isLookupReady = false } = $props();

    /** @type {Record<string, {showActions: boolean, showBackButton: boolean, showLogo: boolean, justify: string}>} */
    const headerConfigs = {
        main: {
            showActions: true,
            showBackButton: false,
            showLogo: true,
            justify: "between",
        },
        settings: {
            showActions: true,
            showBackButton: true,
            showLogo: false,
            justify: "between",
        },
        default: {
            showActions: false,
            showBackButton: false,
            showLogo: true,
            justify: "center",
        },
    };

    const config = $derived(headerConfigs[type] || headerConfigs.default);
</script>

<header class={config.justify === "center" ? "justify-center!" : ""}>
    {#if config.showBackButton}
        {@render headerBackButton()}
    {:else if config.showLogo}
        {@render headerLogo()}
    {/if}

    {#if config.showActions}
        {@render headerActions(type)}
    {/if}
</header>

{#snippet headerLogo(showEnvTag = true)}
    <div class="flex items-center gap-2">
        <a
            href={resolve("/")}
            class="link-logo"
            title="Home"
            aria-label="Home"
            tabindex="0"
        >
            <img src="/logo.svg" alt="Domain Watcher Logo" class="logo" />
            <div
                class="title {PUBLIC_ENVIRONMENT === 'production'
                    ? 'block!'
                    : ''}"
            >
                Domain Watcher
            </div>
        </a>
        {#if showEnvTag}
            <EnvTag />
        {/if}
    </div>
{/snippet}

{#snippet headerBackButton()}
    <div class="flex items-center gap-2">
        <a
            href={resolve("/")}
            class="link-go-back"
            title="Home"
            aria-label="Home"
            tabindex="0"
        >
            <Icon icon="iconoir:arrow-left" class="icon" />
            <div
                class="title {PUBLIC_ENVIRONMENT === 'production'
                    ? 'block!'
                    : ''}"
            >
                Go Back
            </div>
        </a>
        <EnvTag />
    </div>
{/snippet}

{#snippet themeToggle(extraClass = "")}
    <!-- CSS picks the icon and the accessible name (dark: variant), so the
         server-rendered HTML is already right before hydration - no
         moon-to-sun flicker and no wrong label on load -->
    <Button
        onclick={theme.toggle}
        title="Toggle dark mode"
        size="lg"
        color="white-outline"
        class="button--icon-only {extraClass}"
    >
        <span class="icon text-2xl" aria-hidden="true">
            <Icon icon="iconoir:half-moon" class="dark:hidden" />
            <Icon icon="iconoir:sun-light" class="hidden dark:block" />
        </span>
        <span class="sr-only dark:hidden">Switch to dark mode</span>
        <span class="sr-only hidden dark:inline">Switch to light mode</span>
    </Button>
{/snippet}

{#snippet headerActions(actionType = "default")}
    {#if actionType === "main"}
        <div class="flex gap-2 items-center">
            <!-- From sm up only: on phones the header has no room next to the
                 title (the Settings header has the toggle on every size) -->
            {@render themeToggle("hidden! sm:flex!")}
            <div class="relative">
                {#if !isLookupReady}
                    <div
                        class="bg-red animate-pulse size-3 rounded-full absolute -right-0.5 -top-0.5"
                    ></div>
                {/if}
                <Button
                    href={resolve("settings")}
                    title="Settings"
                    ariaLabel="Settings"
                    size="lg"
                    icon="iconoir:settings"
                    color="white-outline"
                />
            </div>

            <form
                {...batchCheck.enhance(async ({ submit }) => {
                    try {
                        await submit();
                        if (batchCheck.result) toast.show(batchCheck.result);
                    } catch (error) {
                        console.error("❌ Batch check failed:", error);
                        toast.show({
                            status: 500,
                            message: "Something went wrong",
                        });
                    }
                })}
            >
                {#if isDemo()}
                    <Tooltip
                        text="Domain checking disabled in Demo mode"
                        position="bottom"
                        hoverOpacity={false}
                        tabindex={0}
                    >
                        <Button
                            type="submit"
                            text="Check Domains"
                            size="lg"
                            icon="iconoir:search"
                            color="white"
                            class="hidden! sm:flex!"
                            disabled={isDemo()}
                        />
                        <Button
                            type="submit"
                            size="lg"
                            icon="iconoir:search"
                            color="white"
                            class="flex! sm:hidden!"
                            ariaLabel="Check Domains"
                            disabled={isDemo()}
                        />
                    </Tooltip>
                {:else}
                    <Button
                        type="submit"
                        text={batchCheck.pending
                            ? "Checking..."
                            : "Check Domains"}
                        size="lg"
                        class="hidden! sm:flex!"
                        icon={batchCheck.pending
                            ? "iconoir:refresh-double"
                            : "iconoir:search"}
                        iconClass={batchCheck.pending ? "animate-spin" : ""}
                        color="white"
                        disabled={!!batchCheck.pending}
                    />
                    <Button
                        type="submit"
                        size="lg"
                        icon={batchCheck.pending
                            ? "iconoir:refresh-double"
                            : "iconoir:search"}
                        iconClass={batchCheck.pending ? "animate-spin" : ""}
                        color="white"
                        class="flex! sm:hidden!"
                        ariaLabel={batchCheck.pending
                            ? "Checking Domains..."
                            : "Check Domains"}
                        disabled={!!batchCheck.pending}
                    />
                {/if}
            </form>
        </div>
    {:else if actionType === "settings"}
        <div class="flex gap-2 items-center">
            <div class="text-xs text-white opacity-50 hidden sm:block">
                Version: {__VERSION__}
            </div>
            {@render themeToggle()}
            <Button
                href="https://github.com/Scorpio3310/domain-watcher"
                title="GitHub"
                ariaLabel="GitHub"
                target="_blank"
                size="lg"
                icon="iconoir:github"
                color="white-outline"
            />
        </div>
    {/if}
{/snippet}
