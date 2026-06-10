<script>
    import Icon from "@iconify/svelte";

    /**
     * @typedef {Object} Props
     * @property {string} name - Radio group name
     * @property {string} id - Unique identifier for this radio button
     * @property {string|number} [value] - Value of this radio button (supplied by `field.as("radio", value)` when spread from a remote form)
     * @property {string|number|boolean} [checked] - Currently selected group value, or boolean checked state when spread from a remote form field (`field.as("radio", value)`)
     * @property {string} [checkedIcon="iconoir:check"] - Icon when checked
     * @property {string} [uncheckedIcon=""] - Icon when unchecked (empty for no icon)
     * @property {'sm'|'md'|'lg'} [size="md"] - Button size
     * @property {'primary'|'secondary'|'success'|'danger'|'warning'} [variant="primary"] - Button variant
     * @property {boolean} [disabled=false] - Disabled state
     * @property {string} [ariaLabel] - Accessibility label
     * @property {Function} [onchange] - Change handler
     */

    /** @type {Props & Record<string, any>} */
    let {
        name,
        id,
        value = undefined,
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

    // Computed values - `checked` is either the selected group value (legacy
    // bind:checked usage) or a boolean coming from a remote form field spread
    const isChecked = $derived(
        typeof checked === "boolean" ? checked : checked === value
    );
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
    /** @param {Event & { currentTarget: EventTarget & HTMLInputElement }} event */
    function handleChange(event) {
        if (!disabled) {
            checked = value;
            onchange?.(value);
        } else {
            event.currentTarget.checked = isChecked;
        }
    }

    // If the `disabled` prop is set but the DOM attribute was tampered away
    // (e.g. via devtools), cancel the click's default action - the browser
    // reverts the radio selection and never fires input/change, so neither
    // the remote-form field state nor the visuals can drift
    /** @param {MouseEvent} event */
    function handleClick(event) {
        if (disabled) {
            event.preventDefault();
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
        checked={isChecked}
        {disabled}
        class="radio-button__input sr-only"
        aria-label={ariaLabel}
        onclick={handleClick}
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
