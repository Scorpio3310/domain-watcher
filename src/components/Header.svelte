<script>
    import { PUBLIC_ENVIRONMENT } from "$env/static/public";
    import Button from "./Button.svelte";
    import EnvTag from "./EnvTag.svelte";
    import Icon from "@iconify/svelte";
    import Tooltip from "./Tooltip.svelte";
    import { toast } from "$src/lib/stores/toast.svelte.js";
    import { isDemo } from "$src/lib/utils/helpers";
    import { batchCheck } from "$src/lib/remote/check-domains.remote";

    let { type = "default", isApiConfigured = false } = $props();

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

<header class={config.justify === "center" ? "!justify-center" : ""}>
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
            href="/"
            class="link-logo"
            title="Home"
            aria-label="Home"
            tabindex="0"
        >
            <img src="/logo.svg" alt="Domain Watcher Logo" class="logo" />
            <div
                class="title {PUBLIC_ENVIRONMENT === 'production'
                    ? '!block'
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
            href="/"
            class="link-go-back"
            title="Home"
            aria-label="Home"
            tabindex="0"
        >
            <Icon icon="iconoir:arrow-left" class="icon" />
            <div
                class="title {PUBLIC_ENVIRONMENT === 'production'
                    ? '!block'
                    : ''}"
            >
                Go Back
            </div>
        </a>
        <EnvTag />
    </div>
{/snippet}

{#snippet headerActions(actionType)}
    {#if actionType === "main"}
        <div class="flex gap-2 items-center">
            <div class="relative">
                {#if !isApiConfigured}
                    <div
                        class="bg-red animate-pulse size-3 rounded-full absolute -right-0.5 -top-0.5"
                    ></div>
                {/if}
                <Button
                    href="/settings"
                    title="Settings"
                    size="lg"
                    icon="iconoir:settings"
                    color="white-outline"
                />
            </div>

            <form
                {...batchCheck.enhance(async ({ submit }) => {
                    try {
                        await submit();
                        toast.show(batchCheck?.result);
                    } catch (error) {
                        console.log(error);
                    }
                })}
            >
                {#if isDemo()}
                    <Tooltip
                        text="Domain checking disabled in Demo mode"
                        position="bottom"
                        hoverOpacity={false}
                    >
                        <Button
                            type="button"
                            text="Check Domains"
                            size="lg"
                            icon="iconoir:search"
                            color="white"
                            class="!hidden sm:!flex"
                            disabled={isDemo()}
                        />
                        <Button
                            type="button"
                            size="lg"
                            icon="iconoir:search"
                            color="white"
                            class="!flex sm:!hidden"
                            disabled={isDemo()}
                        />
                    </Tooltip>
                {:else}
                    <Button
                        type="submit"
                        text={batchCheck.pending ? "Checking..." : "Check Domains"}
                        size="lg"
                        class="!hidden sm:!flex"
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
                        class="!flex sm:!hidden"
                        disabled={!!batchCheck.pending}
                    />
                {/if}
            </form>
        </div>
    {:else if actionType === "settings"}
        <div class="flex gap-2 items-center">
            <div class="text-xs text-white opacity-50">
                Version: {__VERSION__}
            </div>
            <Button
                href="https://github.com/Scorpio3310/domain-watcher"
                title="GitHub"
                target="_blank"
                size="lg"
                icon="iconoir:github"
                color="white-outline"
            />
        </div>
    {/if}
{/snippet}
