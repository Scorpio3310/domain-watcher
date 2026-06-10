<script>
    import Icon from "@iconify/svelte";
    import Tooltip from "./Tooltip.svelte";

    /**
     * Flexible input component with tooltip and icon support
     * @typedef {Object} Props
     * @property {string} [type='text'] - Input type (text, password, email, number, etc.)
     * @property {string} [placeholder=''] - Input placeholder text
     * @property {string} [value=''] - Input value (bindable)
     * @property {string} [label=''] - Label text
     * @property {string} [tooltip=''] - Tooltip text
     * @property {string} [tooltipIcon=''] - Icon for the tooltip (Iconify icon name)
     * @property {boolean} [disabled=false] - Disable the input
     * @property {boolean} [required=false] - Mark input as required
     * @property {string} [id=''] - Input ID for accessibility
     * @property {string} [name=''] - Input name attribute
     * @property {string} [variant='default'] - Input variant (default, error, success)
     * @property {string} [helperText=''] - Helper/error text below input
     * @property {string} [class=''] - Additional CSS classes for the input
     * @property {import('svelte/elements').FormEventHandler<HTMLInputElement>} [oninput] - Input event handler
     * @property {import('svelte/elements').ChangeEventHandler<HTMLInputElement>} [onchange] - Change event handler
     * @property {import('svelte/elements').FocusEventHandler<HTMLInputElement>} [onfocus] - Focus event handler
     * @property {import('svelte/elements').FocusEventHandler<HTMLInputElement>} [onblur] - Blur event handler
     */

    /** @type {Props & Record<string, any>} */
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
