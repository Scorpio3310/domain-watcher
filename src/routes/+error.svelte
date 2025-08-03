<script>
    import { page } from "$app/state";
    import Icon from "@iconify/svelte";
    import { slide } from "svelte/transition";

    // State for controlling expansion
    let isExpanded = $state(false);

    /**
     * Toggle the expanded state of the error details
     */
    const toggleExpansion = () => {
        isExpanded = !isExpanded;
    };

    /**
     * Get error configuration based on status
     */
    const errorConfig = $derived(
        (() => {
            const configs = {
                404: {
                    icon: "iconoir:question-mark-circle",
                    title: "Oops! This page drifted off...",
                    description:
                        "The page you're looking for couldn't be found. You can try again, go back, or contact support if you believe this is a mistake.",
                },
                500: {
                    icon: "iconoir:warning-triangle",
                    title: "Internal Server Error",
                    description:
                        "Something went wrong on our end. Please try again later or contact support if the problem persists.",
                },
                503: {
                    icon: "iconoir:database-xmark",
                    title: "We were unable to connect to the database",
                    description:
                        "This may be due to a temporary server issue or a misconfiguration",
                },
            };

            // Get config for current status or default
            return (
                configs[page?.status] || {
                    icon: "iconoir:error-window",
                    title: "Something went seriously wrong and we couldn't complete your request",
                    description:
                        "You can retry the action, or report the issue directly to support.",
                }
            );
        })()
    );

    /**
     * Formatted error data for display
     */
    const errorData = $derived(
        JSON.stringify(
            {
                status: page?.status,
                message: page?.error?.message,
                ...page?.error,
            },
            null,
            2
        )
    );
</script>

<svelte:head>
    <title>{page?.status} // Domain Watcher</title>
    <meta
        name="description"
        content="Track domain expiration, SSL certificates, and website status in one place."
    />
</svelte:head>

<div class="max-w-3xl mx-auto">
    <div class="card card--error">
        <Icon icon={errorConfig?.icon} class="icon" />

        <h1>{errorConfig?.title}</h1>
        <p>{errorConfig?.description}</p>

        {#if page?.status !== 404}
            <pre><div
                    class="cursor-pointer"
                    onclick={toggleExpansion}
                    onkeydown={(e) => e.key === "Enter" && toggleExpansion()}
                    role="button"
                    tabindex="0"><div class="error"><div
                            class="toggle">{isExpanded
                                ? "Hide Details"
                                : "Show Error Details"}<Icon
                                icon="iconoir:nav-arrow-down-solid"
                                class="icon {isExpanded ? 'rotate-180' : ''}"
                            /></div></div>{#if isExpanded}<div
                            transition:slide><hr /><div
                                class="json-data">{errorData}</div></div>{/if}</div></pre>
        {/if}
    </div>
</div>
