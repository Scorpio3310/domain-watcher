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
     * @property {number} [tabindex] - Makes the wrapper itself focusable (and the tooltip trigger). Set it (to 0) only when the content has no focusable control of its own (icon, badge, disabled button); leave it unset around enabled buttons/links - focusing them shows the tooltip
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
        tabindex = undefined,
        children,
        hoverOpacity = true,
        ...restProps
    } = $props();

    let showTooltip = $state(false);
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let timeoutId;

    // SSR-stable ID for aria-describedby
    const tooltipId = $props.id();

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

    // Cleanup on component destruction - drop a pending show
    $effect(() => {
        return () => clearTimeout(timeoutId);
    });

    /** @param {KeyboardEvent} event */
    const handleKeyDown = (event) => {
        // Hide tooltip on Escape
        if (event.key === "Escape") {
            hideTooltip();
        }
    };

    // Animation configuration based on position
    const flyConfig = $derived({
        y: (position === "top" ? -1 : 1) * (offset + 6),
        duration,
        opacity: 0,
    });

    // CSS classes for positioning
    const tooltipClasses = $derived(
        ["tooltip", `tooltip--${position}`].join(" "),
    );

    // The wrapper is focusable (and is the trigger) only when asked to and
    // there is a tooltip to reveal
    const effectiveTabindex = $derived(
        disabled || !text ? undefined : tabindex,
    );
    const wrapperIsTrigger = $derived(effectiveTabindex !== undefined);

    /**
     * Points the wrapped control (the real trigger) at the tooltip text when
     * the wrapper itself is not focusable
     * @type {import('svelte/attachments').Attachment<HTMLElement>}
     */
    const describeContent = (node) => {
        if (wrapperIsTrigger || disabled || !text) return;

        const control = node.querySelector(
            "a[href], button, input, select, textarea",
        );
        if (!control || control.hasAttribute("aria-describedby")) return;

        control.setAttribute("aria-describedby", tooltipId);
        return () => control.removeAttribute("aria-describedby");
    };
</script>

<!-- The wrapper only relays hover/focus of its content: keyboard users reach
     the tooltip through the wrapped control's own focus (focusin bubbles),
     or through the wrapper when `tabindex` is set for non-focusable content -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
    class="tooltip-container"
    tabindex={effectiveTabindex}
    aria-describedby={wrapperIsTrigger ? tooltipId : undefined}
    onmouseenter={showTooltipWithDelay}
    onmouseleave={hideTooltip}
    onfocusin={showTooltipWithDelay}
    onfocusout={hideTooltip}
    onkeydown={handleKeyDown}
    {@attach describeContent}
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

    <!-- Description target - always in the DOM so aria-describedby resolves
         before the tooltip is shown (hidden nodes still count when referenced) -->
    <span id={tooltipId} hidden>{text}</span>

    <!-- Tooltip (visual copy of the description above) -->
    {#if showTooltip && text}
        <div
            class={tooltipClasses}
            style:--tooltip-offset="{offset}px"
            transition:fly={flyConfig}
            aria-hidden="true"
        >
            {text}
        </div>
    {/if}
</div>
