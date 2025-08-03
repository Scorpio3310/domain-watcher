/**
 * Simple toast store for global notifications using Svelte 5 runes
 * @typedef {Object} ToastMessage
 * @property {string} text - Toast message text
 * @property {string} [id] - Unique identifier
 */

function createToastStore() {
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
         * @param {string} message - Message string to display
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
