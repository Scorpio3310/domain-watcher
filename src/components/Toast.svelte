<script>
    import { fly } from "svelte/transition";
    import Button from "./Button.svelte";
    import Icon from "@iconify/svelte";

    /**
     * Toast notification component with auto-hide and manual close functionality
     * @param {Object} message - Toast message object
     * @param {number} message.status - HTTP status code (200-299 = success, others = error)
     * @param {string} message.message - Text message to display
     * @param {Function} [onClose] - Optional callback when toast is closed
     * @param {number} [autoHideDelay=4000] - Auto-hide delay in milliseconds (0 = no auto-hide)
     *
     * @example
     * <Toast message={{ status: 201, message: "Domain added successfully!" }} />
     * <Toast message={{ status: 400, message: "Failed to save" }} onClose={handleClose} />
     */
    let { message, onClose = null, autoHideDelay = 4000 } = $props();

    // Component state
    let visible = $state(false);
    let timeoutId = null;

    // Computed properties for better readability
    const isSuccess = $derived(message?.status >= 200 && message?.status < 300);
    const shouldAutoHide = $derived(isSuccess && autoHideDelay > 0);

    /**
     * Main reactive logic - shows toast when message changes
     */
    $effect(() => {
        if (!message?.message) return;

        // Show toast immediately
        visible = true;

        // Clear any existing timeout
        clearExistingTimeout();

        // Auto-hide only for success messages (if enabled)
        if (shouldAutoHide) {
            timeoutId = setTimeout(hideToast, autoHideDelay);
        }
    });

    /**
     * Cleanup on component destruction
     */
    $effect(() => {
        return () => clearExistingTimeout();
    });

    /**
     * Hide the toast and trigger onClose callback
     */
    function hideToast() {
        visible = false;
        clearExistingTimeout();

        // Delay onClose callback to allow transition to complete
        if (onClose) {
            setTimeout(onClose, 500); // Match transition duration
        }
    }

    /**
     * Clear existing timeout if it exists
     */
    function clearExistingTimeout() {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
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
    <div
        class="toast-notification"
        transition:fly={{ x: 500, duration: 500 }}
        role="alert"
        aria-live="polite"
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
                class="hover:!bg-white/10"
            />
        </div>
    </div>
{/if}
