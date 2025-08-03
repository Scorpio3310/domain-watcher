<script>
    import Icon from "@iconify/svelte";
    import Tooltip from "./Tooltip.svelte";

    /**
     * Flexible input component with tooltip and icon support
     * @param {string} [type='text'] - Input type (text, password, email, number, etc.)
     * @param {string} [placeholder=''] - Input placeholder text
     * @param {string} [value=''] - Input value (bindable)
     * @param {string} [label=''] - Label text
     * @param {string} [tooltip=''] - Tooltip text
     * @param {string} [tooltipIcon=''] - Icon for the tooltip (Iconify icon name)
     * @param {boolean} [disabled=false] - Disable the input
     * @param {boolean} [required=false] - Mark input as required
     * @param {string} [id=''] - Input ID for accessibility
     * @param {string} [name=''] - Input name attribute
     * @param {string} [variant='default'] - Input variant (default, error, success)
     * @param {string} [helperText=''] - Helper/error text below input
     * @param {string} [class=''] - Additional CSS classes for the input
     * @param {Function} [oninput] - Input event handler
     * @param {Function} [onchange] - Change event handler
     * @param {Function} [onfocus] - Focus event handler
     * @param {Function} [onblur] - Blur event handler
     */
    let {
        type = "text",
        placeholder = "",
        value = $bindable(""),
        label = "",
        tooltip = "",
        tooltipIcon = "iconoir:info-circle",
        disabled = false,
        required = false,
        id = "",
        name = "",
        variant = "default",
        helperText = "",
        class: customClass = "",
        oninput = () => {},
        onchange = () => {},
        onfocus = () => {},
        onblur = () => {},
        ...restProps
    } = $props();

    // Build input classes - combine component classes with custom classes
    const inputClasses = $derived(() => {
        const classes = ["input", `input--${variant}`];

        if (disabled) {
            classes.push("input--disabled");
        }

        // Add custom classes if provided
        if (customClass) {
            classes.push(customClass);
        }

        return classes.join(" ");
    });

    // Label classes
    const labelClasses = $derived(() => {
        const classes = ["input__label"];

        if (disabled) {
            classes.push("input__label--disabled");
        }

        return classes.join(" ");
    });

    // Helper text classes
    const helperClasses = $derived(() => {
        const classes = ["input__helper"];

        if (variant === "error") {
            classes.push("input__helper--error");
        } else if (variant === "success") {
            classes.push("input__helper--success");
        }

        return classes.join(" ");
    });

    // Remove 'class' from restProps to avoid conflicts
    const filteredRestProps = $derived(() => {
        const { class: _, ...filtered } = restProps;
        return filtered;
    });
</script>

<div class="input-field">
    <!-- Label -->
    {#if label}
        <label for={name} class={labelClasses()}>
            {label}
            {#if required}
                <span class="input__required-mark">*</span>
            {/if}

            {#if tooltip}
                <Tooltip text={tooltip} position="bottom">
                    <Icon icon={tooltipIcon} class="input__tooltip-icon" />
                </Tooltip>
            {/if}
        </label>
    {/if}

    <!-- Input -->
    <input
        {id}
        {name}
        {type}
        {placeholder}
        {disabled}
        {required}
        bind:value
        class={inputClasses()}
        {oninput}
        {onchange}
        {onfocus}
        {onblur}
        {...filteredRestProps}
    />

    <!-- Helper Text -->
    {#if helperText}
        <div class={helperClasses()}>
            {helperText}
        </div>
    {/if}
</div>
