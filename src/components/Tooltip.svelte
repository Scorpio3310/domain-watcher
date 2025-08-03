<script>
    import { fly } from "svelte/transition";

    /**
     * Tooltip component with customizable positioning, keyboard accessibility, and automatic hover effects
     * @param {string} text - Tooltip text content to display
     * @param {('top'|'bottom'|'left'|'right')} position - Tooltip position relative to trigger element
     * @param {number} [delay=300] - Show delay in milliseconds before tooltip appears
     * @param {number} [duration=200] - Animation duration in milliseconds for show/hide transitions
     * @param {boolean} [disabled=false] - Disable tooltip functionality completely
     * @param {number} [tabindex=0] - Tab index for keyboard navigation accessibility
     * @param {boolean} [hoverOpacity=true] - Automatically reduce opacity of child elements on hover
     * @param {any} children - Child elements that trigger the tooltip
     * @param {...any} restProps - Additional props passed to the tooltip container
     */
    let {
        text = "",
        position = "top",
        delay = 300,
        duration = 200,
        disabled = false,
        tabindex = 0,
        children,
        hoverOpacity = true,
        ...restProps
    } = $props();

    let showTooltip = $state(false);
    let timeoutId = null;
    let triggerElement = $state();

    const showTooltipWithDelay = () => {
        if (disabled || !text) return;

        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            showTooltip = true;
        }, delay);
    };

    const hideTooltip = () => {
        clearTimeout(timeoutId);
        showTooltip = false;
    };

    // Mouse event handlers
    const handleMouseEnter = () => {
        showTooltipWithDelay();
    };

    const handleMouseLeave = () => {
        hideTooltip();
    };

    // Keyboard event handlers
    const handleFocus = () => {
        showTooltipWithDelay();
    };

    const handleBlur = () => {
        hideTooltip();
    };

    const handleKeyDown = (event) => {
        // Show tooltip on Enter or Space when focused
        if (event.key === "Enter" || event.key === " ") {
            if (!showTooltip) {
                showTooltipWithDelay();
            }
        }
        // Hide tooltip on Escape
        else if (event.key === "Escape") {
            hideTooltip();
        }
    };

    // Animation configuration based on position
    const flyConfig = $derived(() => ({
        y: position === "top" ? -10 : 10,
        duration,
        opacity: 0,
    }));

    // CSS classes for positioning
    const tooltipClasses = $derived(() =>
        ["tooltip", `tooltip--${position}`].join(" ")
    );

    // Generate unique ID for accessibility
    const tooltipId = `tooltip-${Math.random().toString(36).substr(2, 9)}`;

    // Determine effective tabindex
    const effectiveTabindex = $derived(() => {
        if (disabled) return -1;
        return tabindex;
    });
</script>

<div
    bind:this={triggerElement}
    class="tooltip-container"
    role="button"
    tabindex={effectiveTabindex()}
    aria-describedby={showTooltip ? tooltipId : undefined}
    aria-label={text || undefined}
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
    onfocus={handleFocus}
    onblur={handleBlur}
    onkeydown={handleKeyDown}
    {...restProps}
>
    <!-- Trigger element slot -->
    <div
        class="{hoverOpacity
            ? 'hover:opacity-60'
            : ''} transition-all duration-400 -mt-0.5"
    >
        {@render children()}
    </div>

    <!-- Tooltip -->
    {#if showTooltip && text}
        <div
            id={tooltipId}
            class={tooltipClasses()}
            transition:fly={flyConfig()}
            role="tooltip"
            aria-hidden="false"
        >
            {text}
        </div>
    {/if}
</div>
