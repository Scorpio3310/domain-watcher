/**
 * Light/dark theme using Svelte 5 runes. The inline script in app.html
 * applies the theme before the first paint; this store keeps it in sync.
 *
 * Without a saved choice the theme follows the system, also live (e.g. when
 * macOS switches to dark at sunset). Toggling to the opposite of the system
 * theme saves that choice, which then sticks even when the system changes;
 * toggling back to the current system theme removes it, so the app follows
 * the system again.
 * @typedef {"light" | "dark"} Theme
 */

const STORAGE_KEY = "theme";

/** Browser UI color (<meta name="theme-color">) per theme */
const THEME_COLORS = { light: "#f0f0f0", dark: "#0e0e0e" };

const darkQuery = () => matchMedia("(prefers-color-scheme: dark)");

/**
 * Choice kept in memory when storage is blocked (private mode)
 * @type {Theme | null}
 */
let unsavedChoice = null;

/** @returns {Theme} */
const getSystemTheme = () => (darkQuery().matches ? "dark" : "light");

/** @returns {Theme | null} Saved choice, or null when following the system */
const getSavedTheme = () => {
    try {
        const value = localStorage.getItem(STORAGE_KEY);
        return value === "light" || value === "dark" ? value : null;
    } catch {
        return unsavedChoice;
    }
};

/** @param {Theme | null} value - Choice to save, or null to follow the system */
const saveTheme = (value) => {
    unsavedChoice = value;
    try {
        if (value) localStorage.setItem(STORAGE_KEY, value);
        else localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Storage blocked (private mode) - the choice lasts for this page
        // only (kept in unsavedChoice)
    }
};

/**
 * Applies a theme to the document. Transitions are off for one frame, so
 * buttons and inputs don't fade between the old and new colors on top of
 * the already switched page.
 * @param {Theme} value
 */
const applyTheme = (value) => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.dataset.theme = value;
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", THEME_COLORS[value]);
    // Flush styles while transitions are off, then turn them back on
    void getComputedStyle(root).color;
    requestAnimationFrame(() => root.classList.remove("theme-switching"));
};

function createThemeStore() {
    /** @type {Theme} */
    let current = $state("light");
    /** The page is forced to light while the print dialog is open */
    let printing = false;

    /** @param {Theme} value */
    const set = (value) => {
        current = value;
        if (!printing) applyTheme(value);
    };

    return {
        /**
         * Current theme (readonly)
         */
        get current() {
            return current;
        },

        /**
         * Switch between light and dark mode
         */
        toggle: () => {
            const next = current === "dark" ? "light" : "dark";
            saveTheme(next === getSystemTheme() ? null : next);
            set(next);
        },

        /**
         * Sync with the theme app.html applied and follow system changes
         * (without a saved choice), other tabs and printing (always light)
         * @returns {() => void} Cleanup function
         */
        watch: () => {
            const root = document.documentElement;
            current = root.dataset.theme === "dark" ? "dark" : "light";

            const media = darkQuery();
            // A saved choice always wins - only follow the system without one
            const onSystemChange = () => {
                if (getSavedTheme()) return;
                const next = getSystemTheme();
                if (next !== current) set(next);
            };
            /** @param {StorageEvent} event */
            const onStorage = (event) => {
                if (event.key !== STORAGE_KEY && event.key !== null) return;
                const next = getSavedTheme() ?? getSystemTheme();
                if (next !== current) set(next);
            };
            // Dark text would be invisible on paper - print in light mode.
            // Theme changes while the dialog is open apply afterwards.
            const onBeforePrint = () => {
                printing = true;
                applyTheme("light");
            };
            const onAfterPrint = () => {
                printing = false;
                applyTheme(current);
            };

            media.addEventListener("change", onSystemChange);
            addEventListener("storage", onStorage);
            addEventListener("beforeprint", onBeforePrint);
            addEventListener("afterprint", onAfterPrint);

            return () => {
                media.removeEventListener("change", onSystemChange);
                removeEventListener("storage", onStorage);
                removeEventListener("beforeprint", onBeforePrint);
                removeEventListener("afterprint", onAfterPrint);
            };
        },
    };
}

export const theme = createThemeStore();
