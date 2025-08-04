<script>
    import { PUBLIC_ENVIRONMENT } from "$env/static/public";
    import Tooltip from "./Tooltip.svelte";
    import Icon from "@iconify/svelte";

    // Environment configuration
    const environments = {
        demo: {
            label: "Demo",
            modifier: "demo",
            icon: "iconoir:info-circle",
            tooltip:
                "This is a demo version with limited functionality. Want the full version? Click the GitHub icon in settings to deploy your own!",
            showTooltip: true,
        },
        staging: {
            label: "Staging",
            modifier: "staging",
            icon: null,
            tooltip: null,
            showTooltip: false,
        },
        dev: {
            label: "Local",
            modifier: "dev",
            icon: null,
            tooltip: null,
            showTooltip: false,
        },
    };

    // Get current environment config
    const currentEnv = environments?.[PUBLIC_ENVIRONMENT];

    // Don't render anything if environment is not configured or is production
    const shouldRender = currentEnv && PUBLIC_ENVIRONMENT !== "production";
</script>

{#if shouldRender}
    {#if currentEnv.showTooltip}
        <Tooltip text={currentEnv.tooltip} position="bottom">
            <div
                class="environment-tag environment-tag--{currentEnv.modifier} hover-fade"
            >
                {currentEnv.label}

                {#if currentEnv.icon}
                    <Icon
                        icon={currentEnv.icon}
                        class="environment-tag__icon"
                    />
                {/if}
            </div>
        </Tooltip>
    {:else}
        <div class="environment-tag environment-tag--{currentEnv.modifier}">
            {currentEnv.label}

            {#if currentEnv.icon}
                <Icon icon={currentEnv.icon} class="environment-tag__icon" />
            {/if}
        </div>
    {/if}
{/if}
