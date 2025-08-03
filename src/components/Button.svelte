<script>
    import Icon from "@iconify/svelte";
    /**
     * Flexible button component with support for text, icons, or both
     * @param {('lg'|'md'|'sm')} size - Button size
     * @param {('white'|'black'|'white-outline'|'black-outline')} color - Button color variant
     * @param {string} [icon] - Icon name for Iconify (e.g., 'mdi:plus', 'heroicons:search')
     * @param {string} [iconClass] - Icon color class (Tailwind class like 'text-green-500' or 'text-red-600')
     * @param {string} [text] - Button text content
     * @param {string} [children] - Slot content (alternative to text prop)
     * @param {boolean} [disabled] - Disable button
     * @param {Function} [onclick] - Click handler
     * @param {string} [href] - URL for link mode (makes it an <a> tag instead of button)
     * @param {string} [target] - Link target (e.g., '_blank', '_self')
     * @param {string} [title] - Button title for accessibility
     * @param {string} [type] - Button type when in button mode (e.g., 'submit', 'button')
     * @param {number} [tabindex] - Tab index for keyboard navigation
     * @property {string} [ariaLabel] - Accessibility label
     * @param {string} [class] - Additional CSS classes for the button
     */
    let {
        size = "md",
        color = "white",
        icon = "",
        iconClass = "",
        text = "",
        children = undefined,
        disabled = false,
        onclick = () => {},
        href = "",
        target = "",
        title = "",
        type = "button",
        tabindex = undefined,
        ariaLabel,
        class: customClass = "",
        ...restProps
    } = $props();

    // Determine if this should be a link or button
    const isLink = $derived(!!href);

    // Determine what content to show
    const hasIcon = $derived(!!icon);
    const hasText = $derived(!!text || !!children);
    const iconOnly = $derived(hasIcon && !hasText);

    // Build CSS classes - combine component classes with custom classes
    const buttonClasses = $derived(() => {
        const classes = ["button", `button--${size}`, `button--${color}`];

        // Add icon-only specific styling if needed
        if (iconOnly) {
            classes.push("button--icon-only");
        }

        // Add disabled class
        if (disabled) {
            classes.push("button--disabled");
        }

        // Add custom classes if provided
        if (customClass) {
            classes.push(customClass);
        }

        return classes.join(" ");
    });

    // Icon size based on button size
    const iconSize = $derived(() => {
        switch (size) {
            case "lg":
                return "text-2xl";
            case "md":
                return "text-xl";
            case "sm":
                return "text-lg";
            default:
                return "text-xl";
        }
    });

    // Icon classes - combine size, color and spacing
    const iconClasses = $derived(() => {
        const classes = [iconSize()];

        // Add custom color class if provided
        if (iconClass) {
            classes.push(iconClass);
        }

        return classes.join(" ");
    });

    // Handle click only if not disabled
    const handleClick = (event) => {
        if (disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        onclick(event);
    };

    // Handle keyboard events
    const handleKeyDown = (event) => {
        if (disabled) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }

        // For both links and buttons, Enter and Space should trigger action
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();

            if (isLink && href) {
                // For links, navigate programmatically
                if (target === "_blank") {
                    window.open(href, "_blank");
                } else {
                    window.location.href = href;
                }
            } else {
                // Check if this is a submit button in a form
                const form = event.target.closest("form");

                if (type === "submit" && form) {
                    // Use requestSubmit to trigger form validation and submission
                    form.requestSubmit(event.target);
                } else {
                    // For regular buttons or buttons not in forms
                    handleClick(event);
                }
            }
        }
    };

    // Determine tabindex value
    const effectiveTabindex = $derived(() => {
        if (disabled) return -1;
        if (tabindex !== undefined) return tabindex;
        return 0; // Default focusable
    });

    // Remove 'class' from restProps to avoid conflicts
    const filteredRestProps = $derived(() => {
        const { class: _, ...filtered } = restProps;
        return filtered;
    });
</script>

<svelte:element
    this={isLink ? "a" : "button"}
    href={isLink ? href : undefined}
    target={isLink ? target : undefined}
    title={title || (iconOnly && text ? text : undefined)}
    type={isLink ? undefined : type}
    disabled={isLink ? undefined : disabled}
    tabindex={effectiveTabindex()}
    aria-disabled={disabled ? "true" : "false"}
    aria-label={ariaLabel ? ariaLabel : text}
    role={isLink ? "link" : "button"}
    class={buttonClasses()}
    onclick={handleClick}
    onkeydown={handleKeyDown}
    {...filteredRestProps}
>
    {#if hasIcon}
        <span class="icon {iconSize()}" aria-hidden="true">
            <Icon {icon} class={iconClasses()} />
        </span>
    {/if}
    {#if text}
        <span class="button-text">{text}</span>
    {:else if children}
        {@render children()}
    {/if}
</svelte:element>
