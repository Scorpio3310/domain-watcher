<script>
    import { fly } from "svelte/transition";
    import ButtonPlayground from "$components/playground/ButtonPlayground.svelte";
    import InputPlayground from "$components/playground/InputPlayground.svelte";
    import RadioButtonPlayground from "$components/playground/RadioButtonPlayground.svelte";
    import ToggleSwitchPlayground from "$components/playground/ToggleSwitchPlayground.svelte";

    // Component configuration with metadata
    const components = [
        {
            id: "buttons",
            name: "Buttons",
            icon: "🔘",
            component: ButtonPlayground,
            isDefault: true,
        },
        {
            id: "inputs",
            name: "Input Fields",
            icon: "📝",
            component: InputPlayground,
            isDefault: false,
        },
        {
            id: "toggles",
            name: "Toggle Switches",
            icon: "🔀",
            component: ToggleSwitchPlayground,
            isDefault: false,
        },
        {
            id: "radios",
            name: "Radio Buttons",
            icon: "⚪",
            component: RadioButtonPlayground,
            isDefault: false,
        },
    ];

    // Get default component or fallback to first
    const getDefaultComponent = () => {
        const defaultComp = components.find((comp) => comp.isDefault);
        return defaultComp?.id || components[0]?.id;
    };

    // Reactive state for active component
    let activeComponent = $state(getDefaultComponent());

    // Computed active component data
    const activeComponentData = $derived(
        components.find((comp) => comp.id === activeComponent)
    );

    // Get the actual component to render (Svelte 5 runes way)
    const currentComponent = $derived(activeComponentData?.component);

    /**
     * Switch to different component
     * @param {string} componentId - ID of component to activate
     */
    const switchComponent = (componentId) => {
        activeComponent = componentId;
    };

    /**
     * Check if component is currently active
     * @param {string} componentId - ID to check
     * @returns {boolean}
     */
    const isActive = (componentId) => activeComponent === componentId;
</script>

<svelte:head>
    <title>UI Component Lab ⚗️ // Domain Watcher</title>
    <meta
        name="description"
        content="Your sandbox for experimenting with components! Tweak settings, test edge cases, and see how everything behaves. No production worries here - just pure experimentation."
    />
</svelte:head>

<div class="hero-section my-16">
    <div class="grid gap-4 text-center">
        <h1>UI Component Lab ⚗️</h1>
        <p>
            Your sandbox for experimenting with components! Tweak settings, test
            edge cases, and see how everything behaves. No production worries
            here - just pure experimentation.
        </p>
    </div>
</div>

<div class="max-w-6xl mx-auto playground-container">
    <!-- Component Navigation -->
    <div class="mb-8">
        <div class="flex flex-wrap gap-3 justify-center">
            {#each components as component}
                <button
                    type="button"
                    class="component-nav-button {isActive(component.id)
                        ? 'active'
                        : ''}"
                    onclick={() => switchComponent(component.id)}
                    aria-label="Switch to {component.name} playground"
                >
                    <span class="icon" aria-hidden="true">{component.icon}</span
                    >
                    <span class="text">{component.name}</span>
                    {#if component.isDefault}
                        <span
                            class="default-badge"
                            aria-label="Default component">★</span
                        >
                    {/if}
                </button>
            {/each}
        </div>
    </div>

    <!-- Component Playground Area -->
    <div>
        {#if currentComponent}
            {#key activeComponent}
                <div in:fly={{ y: 100, duration: 300, opacity: 50 }}>
                    <!-- Svelte 5 runes way - direct component rendering -->
                    {@render currentComponent()}
                </div>
            {/key}
        {:else}
            <div
                class="flex items-center justify-center h-96 text-gray-500 text-lg"
            >
                <p>⚠️ Component not found</p>
            </div>
        {/if}
    </div>
</div>
