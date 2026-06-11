/**
 * Simple toast store for global notifications using Svelte 5 runes
 * @typedef {import('$lib/types').ToastPayload} ToastPayload
 * @typedef {Object} ToastMessage
 * @property {ToastPayload} text - Toast payload ({status, message})
 * @property {string} id - Unique identifier
 */

function createToastStore() {
    /** @type {ToastMessage | null} */
    let currentToast = $state(null);

    return {
        /**
         * Get current toast (readonly)
         */
        get current() {
            return currentToast;
        },

        /**
         * Show a toast message
         * @param {ToastPayload} message - Toast payload ({status, message}) to display
         */
        show: (message) => {
            currentToast = {
                text: message,
                id: Date.now().toString(),
            };
        },

        /**
         * Clear current toast
         */
        clear: () => {
            currentToast = null;
        },
    };
}

export const toast = createToastStore();
