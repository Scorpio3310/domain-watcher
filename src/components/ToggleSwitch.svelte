<!-- ToggleSwitch.svelte -->
<script>
    import Icon from "@iconify/svelte";

    /**
     * @typedef {Object} Props
     * @property {string} [name] - Input name for form submission
     * @property {string} id - Unique identifier for this toggle switch
     * @property {boolean} [checked=false] - Toggle state
     * @property {'sm'|'md'|'lg'} [size="md"] - Switch size
     * @property {'primary'|'secondary'|'success'|'danger'|'warning'} [variant="primary"] - Switch variant
     * @property {boolean} [disabled=false] - Disabled state
     * @property {string} [ariaLabel] - Accessibility label
     * @property {string} [checkedIcon=""] - Icon when checked (empty for no icon)
     * @property {string} [uncheckedIcon=""] - Icon when unchecked (empty for no icon)
     * @property {Function} [onchange] - Change handler
     */

    let {
        name = undefined,
        id,
        checked = $bindable(false),
        size = "md",
        variant = "primary",
        disabled = false,
        ariaLabel = undefined,
        checkedIcon = "",
        uncheckedIcon = "",
        onchange = undefined,
        ...restProps
    } = $props();

    // Computed values
    const currentIcon = $derived(checked ? checkedIcon : uncheckedIcon);
    const showIcon = $derived(
        checked ? checkedIcon !== "" : uncheckedIcon !== ""
    );

    // Build CSS classes using BEM methodology
    const switchClasses = $derived(
        [
            "toggle-switch",
            `toggle-switch--${size}`,
            `toggle-switch--${variant}`,
            checked ? "toggle-switch--checked" : "toggle-switch--unchecked",
            disabled ? "toggle-switch--disabled" : "",
        ]
            .filter(Boolean)
            .join(" ")
    );

    const thumbClasses = $derived(
        [
            "toggle-switch__thumb",
            `toggle-switch__thumb--${size}`,
            checked ? "toggle-switch__thumb--checked" : "",
        ]
            .filter(Boolean)
            .join(" ")
    );

    // Handle change
    function handleChange(event) {
        if (!disabled) {
            onchange?.(event.target.checked);
        }
    }
</script>

<div>
    <!-- Hidden checkbox input for form submission and accessibility -->
    <input
        type="checkbox"
        {name}
        {id}
        bind:checked
        {disabled}
        class="toggle-switch__input sr-only"
        aria-label={ariaLabel}
        onchange={handleChange}
        {...restProps}
    />
    <!-- Visual switch (non-interactive, just for display) -->
    <label for={id} class={switchClasses}>
        <div class={thumbClasses}>
            {#if showIcon}
                <Icon icon={currentIcon} class="toggle-switch__icon" />
            {/if}
        </div>
    </label>
</div>
