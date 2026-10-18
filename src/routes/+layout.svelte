<script>
    import Header from "#components/Header.svelte";
    import Toast from "#components/Toast.svelte";
    import { page } from "$app/state";
    import { toast } from "#lib/stores/toast.svelte.js";
    import "../app.css";
    // Registers the bundled icon subset (server + browser) before any icon renders
    import "#lib/icons/register.js";
    import NoJavascript from "#components/NoJavascript.svelte";
    import { dev } from "$app/env";
    import { onMount } from "svelte";
    import { theme } from "#lib/stores/theme.svelte.js";

    /** @type {import('./$types').LayoutProps} */
    let { children, data } = $props();

    // Follow system theme changes, other tabs and printing
    onMount(() => theme.watch());

    /**
     * Text of the current success toast, announced by the polite live region
     * below (error toasts announce themselves via role="alert")
     */
    const successAnnouncement = $derived.by(() => {
        const status = toast.current?.text.status ?? 0;
        return status >= 200 && status < 300
            ? (toast.current?.text.message ?? "")
            : "";
    });

    /**
     * Determines header type based on current route
     * @param {string} pathname - Current page pathname
     * @param {number} status - HTTP status code
     * @returns {string} Header type (main, settings, default)
     */
    const getHeaderType = (pathname, status) => {
        if (status >= 500) return "default";

        const path = pathname.replace(/\/$/, "") || "/";

        if (path === "/" || path.startsWith("/dashboard")) return "main";
        if (path.startsWith("/settings")) return "settings";

        return "default";
    };

    // Reactive header type
    const headerType = $derived(getHeaderType(page.url.pathname, page.status));
</script>

<!-- Page-independent tags only. Each page owns its title, description and
     og/twitter title + description (Svelte de-duplicates only <title>; the
     title below is just a fallback) -->
<svelte:head>
    {#if dev}
        <link rel="shortcut icon" href="./favicon-dev.ico" />
    {/if}
    <title>Domain Watcher // Never Lose a Domain Again</title>
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content={page?.url?.href} />
    <meta property="og:image" content="{page?.url?.origin}/og_image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="Domain Watcher" />

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image" />
    <meta property="twitter:url" content={page?.url?.href} />
    <meta property="twitter:image" content="{page?.url?.origin}/og_image.jpg" />
</svelte:head>

<NoJavascript />

<div class="app-container max-w-5xl mx-auto">
    <Header type={headerType} isLookupReady={data.isLookupReady} />

    <main class="main-content">
        {@render children()}
    </main>
</div>

<!-- Background Effects -->
<div class="background-effects">
    <div class="blured-left"></div>
    <div class="blured-right"></div>
</div>

<!-- Global Toast System -->
<!-- Persistent live region: it must already exist when its content changes
     for screen readers to announce it reliably. Keyed on the toast id so a
     repeated identical message is announced again. -->
<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {#key toast.current?.id}
        {#if successAnnouncement}
            <p>{successAnnouncement}</p>
        {/if}
    {/key}
</div>

{#if toast.current}
    {#key toast.current.id}
        <Toast message={toast.current.text} onClose={toast.clear} />
    {/key}
{/if}
