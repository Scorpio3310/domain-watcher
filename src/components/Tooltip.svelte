<script>
    import { fly } from "svelte/transition";

    /**
     * Tooltip component with customizable positioning, keyboard accessibility, and automatic hover effects
     * @typedef {Object} Props
     * @property {string} [text] - Tooltip text content to display
     * @property {('top'|'bottom'|'left'|'right')} [position] - Tooltip position relative to trigger element
     * @property {number} [delay=300] - Show delay in milliseconds before tooltip appears
     * @property {number} [duration=200] - Animation duration in milliseconds for show/hide transitions
     * @property {number} [offset=4] - Vertical distance in px between tooltip and trigger element
     * @property {boolean} [disabled=false] - Disable tooltip functionality completely
     * @property {number} [tabindex=0] - Tab index for keyboard navigation accessibility
     * @property {boolean} [hoverOpacity=true] - Automatically reduce opacity of child elements on hover
     * @property {import('svelte').Snippet} children - Child elements that trigger the tooltip
     */

    /** @type {Props & Record<string, any>} */
    let {
        text = "",
        position = "top",
        delay = 300,
        duration = 200,
        offset = 4,
        disabled = false,
        tabindex = 0,
        children,
        hoverOpacity = true,
        ...restProps
    } = $props();

    let showTooltip = $state(false);
    /** @type {ReturnType<typeof setTimeout>|null} */
    let timeoutId = null;
    let triggerElement = $state();

    const showTooltipWithDelay = () => {
        if (disabled || !text) return;

        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            showTooltip = true;
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutId) clearTimeout(timeoutId);
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

    /** @param {KeyboardEvent} event */
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
        y: (position === "top" ? -1 : 1) * (offset + 6),
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
            style:--tooltip-offset="{offset}px"
            transition:fly={flyConfig()}
            role="tooltip"
            aria-hidden="false"
        >
            {text}
        </div>
    {/if}
</div>
