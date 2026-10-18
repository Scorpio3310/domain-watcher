<script>
    import { fly } from "svelte/transition";
    import Button from "./Button.svelte";
    import Icon from "@iconify/svelte";

    /**
     * Toast notification component with auto-hide and manual close functionality
     * @typedef {Object} Props
     * @property {{status: number, message: string}} message - Toast message object (status 200-299 = success, others = error)
     * @property {(() => void)|null} [onClose] - Optional callback when toast is closed
     * @property {number} [autoHideDelay=4000] - Auto-hide delay in milliseconds (0 = no auto-hide)
     *
     * @example
     * <Toast message={{ status: 201, message: "Domain added successfully!" }} />
     * <Toast message={{ status: 400, message: "Failed to save" }} onClose={handleClose} />
     */

    /** @type {Props} */
    let { message, onClose = null, autoHideDelay = 4000 } = $props();

    // Component state - starts visible; the intro is played by `in:fly|global`
    // below (a local intro would be skipped because the layout's {#key}
    // creates this component together with its {#if} block)
    let visible = $state(true);
    /** @type {ReturnType<typeof setTimeout>|undefined} */
    let closeTimeoutId;

    // Computed properties for better readability
    const isSuccess = $derived(message?.status >= 200 && message?.status < 300);
    const shouldAutoHide = $derived(isSuccess && autoHideDelay > 0);

    /**
     * Auto-hide only success messages (if enabled) while the toast is visible
     */
    $effect(() => {
        if (!visible || !shouldAutoHide) return;

        const autoHideTimeoutId = setTimeout(hideToast, autoHideDelay);
        return () => clearTimeout(autoHideTimeoutId);
    });

    /**
     * Cleanup on component destruction - cancel a pending onClose, otherwise
     * it fires after the next toast replaced this one and clears that toast
     */
    $effect(() => {
        return () => clearTimeout(closeTimeoutId);
    });

    /**
     * Hide the toast and trigger onClose callback
     */
    function hideToast() {
        visible = false;

        // Delay onClose callback to allow transition to complete
        if (onClose) {
            clearTimeout(closeTimeoutId);
            closeTimeoutId = setTimeout(onClose, 500); // Match transition duration
        }
    }

    /**
     * Handle manual close button click
     */
    function handleCloseClick() {
        hideToast();
    }
</script>

{#if visible && message?.message}
    <!-- Success text is announced by the persistent live region in
         +layout.svelte (a role="status" inserted together with its content is
         often missed); errors announce themselves via role="alert" -->
    <div
        class="toast-notification"
        in:fly|global={{ x: 500, duration: 500 }}
        out:fly={{ x: 500, duration: 500 }}
        role={isSuccess ? undefined : "alert"}
    >
        <div class="panel {isSuccess ? 'panel--success' : 'panel--error'}">
            <div class="bg-blur"></div>

            <!-- Status icon -->
            <div class="icon-box">
                {#if isSuccess}
                    <Icon icon="iconoir:check" class="icon" />
                {:else}
                    <Icon icon="iconoir:xmark" class="icon" />
                {/if}
            </div>

            <!-- Message text -->
            <p class="message-text">{message.message}</p>

            <!-- Close button -->
            <Button
                type="button"
                size="sm"
                icon="iconoir:xmark"
                iconClass="text-white"
                color="black"
                onclick={handleCloseClick}
                aria-label="Close notification"
                class="hover:bg-white/10!"
            />
        </div>
    </div>
{/if}
