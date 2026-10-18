<script>
    import Button from "#components/Button.svelte";
    import DomainCard from "#components/DomainCard.svelte";
    import Input from "#components/Input.svelte";
    import { toast } from "#lib/stores/toast.svelte.js";
    import Icon from "@iconify/svelte";
    import { addDomain } from "#lib/remote/add-domain.remote.js";
    import { addDomainSchema } from "./validation";
    import { flip } from "svelte/animate";
    import { scale, fly } from "svelte/transition";
    import Tooltip from "#components/Tooltip.svelte";
    import { isDemo } from "#lib/utils/helpers.js";

    //// PROPS ////
    /** @type {import('./$types').PageProps} */
    let { data } = $props();
</script>

<!-- Page-specific tags only - shared og/twitter tags live in +layout.svelte -->
<svelte:head>
    <title>Domain Watcher // Never Lose a Domain Again</title>
    <meta
        name="description"
        content="Track domain expiration, SSL certificates, and website status in one place."
    />
    <meta
        property="og:title"
        content="Domain Watcher // Never Lose a Domain Again"
    />
    <meta
        property="og:description"
        content="Track domain expiration, SSL certificates, and website status in one place."
    />
    <meta
        property="twitter:title"
        content="Domain Watcher // Never Lose a Domain Again"
    />
    <meta
        property="twitter:description"
        content="Track domain expiration, SSL certificates, and website status in one place."
    />
</svelte:head>

<div class="hero-section mt-16">
    <div class="grid gap-4 text-center">
        <h1>Welcome Back!</h1>
        <p>Keep track of all your domains in one place.</p>
    </div>

    <form
        class="mt-8"
        {...addDomain.preflight(addDomainSchema).enhance(
            async ({ submit, element }) => {
                try {
                    if (await submit()) {
                        const result = addDomain.result;
                        if (result) toast.show(result);
                        // Only clear the input once the domain was added - a
                        // rejected one (duplicate, demo mode, server error)
                        // stays in the field so it can be fixed or retried
                        if (
                            result &&
                            result.status >= 200 &&
                            result.status < 300
                        ) {
                            element.reset();
                        }
                    }
                    // invalid data -> issues render inline below the input
                } catch {
                    toast.show({
                        status: 500,
                        message: "Something went wrong",
                    });
                }
            },
        )}
        oninput={() => addDomain.validate({ preflightOnly: true })}
    >
        <div class="relative">
            <Input
                type="text"
                id="domainName"
                placeholder="Enter a domain name...."
                aria-label="Domain name"
                disabled={false}
                class="pr-40!"
                variant={addDomain.fields.domainName.issues()?.length
                    ? "error"
                    : "default"}
                helperText={addDomain.fields.domainName.issues()?.[0]
                    ?.message ?? ""}
                {...addDomain.fields.domainName.as("text")}
            />

            {#if isDemo()}
                <div class="absolute top-1.5 right-1">
                    <Tooltip
                        text="Domain adding disabled in Demo mode"
                        position="bottom"
                        hoverOpacity={false}
                        tabindex={0}
                    >
                        <Button
                            type="submit"
                            text="Add Domain"
                            size="md"
                            icon="iconoir:plus"
                            iconClass="text-lime"
                            color="black"
                            disabled={isDemo()}
                        />
                    </Tooltip>
                </div>
            {:else}
                <Button
                    type="submit"
                    text="Add Domain"
                    size="md"
                    icon="iconoir:plus"
                    iconClass="text-lime"
                    color="black"
                    class="absolute top-1 right-1"
                    ariaLabel="Add Domain"
                />
            {/if}
        </div>
    </form>
</div>

{#if data?.domains?.length === 0}
    <div
        class="card card--error max-w-3xl mx-auto"
        in:fly={{ y: 100, duration: 400 }}
    >
        <Icon icon="iconoir:globe" class="icon" />

        <h2>Your domain watchlist is empty</h2>
        <p>
            Time to add some domains to your watchlist and become the ultimate
            domain guardian.
        </p>
    </div>
{:else}
    <div class="mt-16" in:fly={{ y: 100, duration: 400 }}>
        <div class="hero-domain-title">
            <h2>
                Domain{data?.domains?.length === 1 ? "" : "s"} ({data?.domains
                    ?.length || 0})
            </h2>
        </div>

        <!-- Rendered directly (no <svelte:boundary> pending snippet): nothing
             here awaits, and with experimental async a pending snippet makes
             SSR emit only the placeholder instead of the domain list -->
        <div class="grid gap-2">
            {#each data?.domains as domain (domain.id)}
                <div
                    in:scale={{
                        duration: 200,
                        start: 0.7,
                        opacity: 0,
                        delay: 100,
                    }}
                    animate:flip={{ duration: 300 }}
                >
                    <DomainCard
                        data={domain}
                        uiView={data?.viewMode}
                        isApiConfigured={data?.isApiConfigured}
                        lookupProvider={data?.lookupProvider}
                        whoisjsonFallback={data?.whoisjsonFallback}
                    />
                </div>
            {/each}
        </div>
    </div>
{/if}
