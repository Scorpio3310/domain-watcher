<!-- RadioButton.svelte -->
<script>
    import Icon from "@iconify/svelte";

    /**
     * @typedef {Object} Props
     * @property {string} name - Radio group name
     * @property {string} id - Unique identifier for this radio button
     * @property {string|number} value - Value of this radio button
     * @property {string|number} [checked] - Currently selected value
     * @property {string} [checkedIcon="iconoir:check"] - Icon when checked
     * @property {string} [uncheckedIcon=""] - Icon when unchecked (empty for no icon)
     * @property {'sm'|'md'|'lg'} [size="md"] - Button size
     * @property {'primary'|'secondary'|'success'|'danger'|'warning'} [variant="primary"] - Button variant
     * @property {boolean} [disabled=false] - Disabled state
     * @property {string} [ariaLabel] - Accessibility label
     * @property {Function} [onchange] - Change handler
     */

    let {
        name,
        id,
        value,
        checked = $bindable(),
        checkedIcon = "iconoir:check",
        uncheckedIcon = "",
        size = "md",
        variant = "primary",
        disabled = false,
        ariaLabel,
        onchange = undefined,
        ...restProps
    } = $props();

    // Computed values
    const isChecked = $derived(checked === value);
    const currentIcon = $derived(isChecked ? checkedIcon : uncheckedIcon);
    const showIcon = $derived(isChecked || uncheckedIcon !== "");

    // Build CSS classes using BEM methodology
    const buttonClasses = $derived(
        [
            "radio-button",
            `radio-button--${size}`,
            `radio-button--${variant}`,
            isChecked ? "radio-button--checked" : "radio-button--unchecked",
            disabled ? "radio-button--disabled" : "",
        ]
            .filter(Boolean)
            .join(" ")
    );

    // Handle change
    function handleChange() {
        if (!disabled) {
            checked = value;
            onchange?.(value);
        }
    }
</script>

<div class="relative block">
    <!-- Hidden radio input for form submission and accessibility -->
    <input
        type="radio"
        {name}
        {id}
        {value}
        bind:group={checked}
        {disabled}
        class="radio-button__input sr-only"
        aria-label={ariaLabel}
        onchange={handleChange}
        {...restProps}
    />

    <!-- Visual label (non-interactive, just for display) -->
    <label for={id} class={buttonClasses}>
        {#if showIcon}
            <Icon icon={currentIcon} class="radio-button__icon" />
        {/if}
    </label>
</div>
