<script>
    import Button from "$components/Button.svelte";
    import DomainCard from "$components/DomainCard.svelte";
    import Input from "$components/Input.svelte";
    import { toast } from "$src/lib/stores/toast.svelte.js";
    import Icon from "@iconify/svelte";
    import { superForm } from "sveltekit-superforms";
    import { flip } from "svelte/animate";
    import { scale, fly } from "svelte/transition";
    import Tooltip from "$components/Tooltip.svelte";
    import { isDemo } from "$src/lib/utils/helpers.js";
    import { page } from "$app/state";

    //// PROPS ////
    let { data } = $props();

    //// SUPERFORMS ////
    const { form, errors, constraints, enhance } = superForm(
        data?.formAddDomain,
        {
            id: "add-domain",
            resetForm: true,
            onResult: ({ result }) => {
                if (result.type === "success" && result.data?.form?.message) {
                    toast.show(result.data?.form?.message);
                }
            },
        },
    );
</script>

<svelte:head>
    <title>Domain Watcher // Never Lose a Domain Again</title>
    <meta
        name="description"
        content="Track domain expiration, SSL certificates, and website status in one place."
    />
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content={page?.url?.href} />
    <meta
        property="og:title"
        content="Domain Watcher // Never Lose a Domain Again"
    />
    <meta
        property="og:description"
        content="Track domain expiration, SSL certificates, and website status in one place."
    />
    <meta property="og:image" content="{page?.url?.origin}/og_image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="Domain Watcher" />

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content={page?.url?.href} />
    <meta
        property="twitter:title"
        content="Domain Watcher // Never Lose a Domain Again"
    />
    <meta
        property="twitter:description"
        content="Track domain expiration, SSL certificates, and website status in one place."
    />
    <meta property="twitter:image" content="{page?.url?.origin}/og_image.jpg" />
</svelte:head>

<div class="hero-section mt-16">
    <div class="grid gap-4 text-center">
        <h1>Welcome Back!</h1>
        <p>Keep track of all your domains in one place.</p>
    </div>

    <form class="mt-8" method="POST" action="?/addDomain" use:enhance>
        <div class="relative">
            <Input
                type="text"
                name="domainName"
                id="domainName"
                placeholder="Enter a domain name...."
                disabled={false}
                bind:value={$form.domainName}
                class="pr-40!"
                variant={$errors.domainName ? "error" : "default"}
                helperText={$errors.domainName ? $errors.domainName[0] : ""}
                {...$constraints.domainName}
            />

            {#if isDemo()}
                <div class="absolute top-1.5 right-1">
                    <Tooltip
                        text="Domain adding disabled in Demo mode"
                        position="bottom"
                        hoverOpacity={false}
                    >
                        <Button
                            type="button"
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
        in:fly={{ y: 100, duration: 400, start: 0.8 }}
    >
        <Icon icon="iconoir:globe" class="icon" />

        <h2>Your domain watchlist is empty</h2>
        <p>
            Time to add some domains to your watchlist and become the ultimate
            domain guardian.
        </p>
    </div>
{:else}
    <div class="mt-16" in:fly={{ y: 100, duration: 400, start: 0.8 }}>
        <div class="hero-domain-title">
            <h2>
                Domain{data?.domains?.length === 1 ? "" : "s"} ({data?.domains
                    ?.length || 0})
            </h2>
        </div>

        <svelte:boundary>
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
                        <DomainCard data={domain} uiView={data?.viewMode} />
                    </div>
                {/each}
            </div>
            {#snippet pending()}
                <div class="space-y-2 opacity-50">
                    {#each Array(4) as _, i}
                        <div class="card card-domain">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-4">
                                    <div
                                        class="size-10 rounded-full bg-white/80 animate-pulse flex-none"
                                    ></div>
                                    <div
                                        class="h-5 bg-white/80 animate-pulse rounded-2xl w-20 sm:w-52 lg:w-60 flex-none"
                                    ></div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <div
                                        class="h-10 bg-white/80 animate-pulse rounded-full w-32"
                                    ></div>
                                    <div
                                        class="size-10 bg-white/80 animate-pulse rounded-full"
                                    ></div>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/snippet}
        </svelte:boundary>
    </div>
{/if}
