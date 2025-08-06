<script>
    import Header from "$components/Header.svelte";
    import Toast from "$components/Toast.svelte";
    import { page } from "$app/state";
    import { toast } from "$src/lib/stores/toast.svelte.js";
    import "../app.css";
    import NoJavascript from "$components/NoJavascript.svelte";
    import { dev } from "$app/environment";

    let { children, data } = $props();

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

<svelte:head>
    {#if dev}
        <link rel="shortcut icon" href="./favicon-dev.ico" />
    {/if}
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

<NoJavascript />

<div class="app-container max-w-5xl mx-auto">
    <Header type={headerType} isApiConfigured={data.isApiConfigured} />

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
{#if toast.current}
    {#key toast.current.id}
        <Toast message={toast.current.text} onClose={toast.clear} />
    {/key}
{/if}
