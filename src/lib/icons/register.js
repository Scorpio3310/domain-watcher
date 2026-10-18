/**
 * @fileoverview Registers the bundled iconoir subset with @iconify/svelte.
 * With the icon data already in storage, <Icon icon="iconoir:..."> renders
 * its <svg> synchronously - in the SSR HTML and on the first client render -
 * instead of fetching from api.iconify.design after hydration.
 *
 * Imported once (for its side effects) by src/routes/+layout.svelte, so it runs
 * on the server and in the browser before any page renders an icon. Only the
 * generated subset is bundled - after adding or renaming an icon, run
 * `pnpm icons` to regenerate iconoir.json.
 * @module Icons
 */

import { addCollection, setCustomIconsLoader } from "@iconify/svelte";
import iconoir from "./iconoir.json";

addCollection(iconoir);

// A custom loader replaces the Iconify API for the iconoir prefix, so an icon
// missing from the subset is never fetched from a third party: it resolves to
// nothing (the icon renders empty) and points at the fix instead. Runs only
// in the browser - during SSR the component never tries to load icons.
setCustomIconsLoader((names) => {
    console.warn(
        `⚠️ Icon(s) missing from the bundled subset: ${names
            .map((name) => `iconoir:${name}`)
            .join(", ")} - run "pnpm icons"`
    );
    return null;
}, iconoir.prefix);
