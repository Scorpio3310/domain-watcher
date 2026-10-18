/**
 * @fileoverview Generates the bundled iconoir subset (src/lib/icons/iconoir.json)
 * that #lib/icons/register.js registers with @iconify/svelte, so icons render
 * during SSR and never come from the Iconify API at runtime.
 *
 * Collects every literal "iconoir:<name>" reference in src/ (the icon must be
 * written out in full - a dynamically built name can't be collected and fails
 * the run) and extracts just those icons from @iconify-json/iconoir. Fails
 * loudly when a referenced icon doesn't exist in the collection.
 *
 * Node-only build script - never import it from app code.
 *
 * @example
 * pnpm icons          // regenerate src/lib/icons/iconoir.json
 * pnpm icons --check  // exit 1 when the committed subset is out of date
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { Buffer } from "node:buffer";
import { getIcons } from "@iconify/utils";
import { icons as iconoirCollection } from "@iconify-json/iconoir";

const ICONS_DIR = fileURLToPath(new URL(".", import.meta.url));
const SRC_DIR = fileURLToPath(new URL("../../", import.meta.url));
const OUTPUT_FILE = join(ICONS_DIR, "iconoir.json");

/** Source files that can reference icons */
const SCANNED_EXTENSIONS = new Set([".svelte", ".js", ".ts", ".html"]);

/** Icon name as written in source ("iconoir:nav-arrow-up") */
const ICON_REFERENCE = /iconoir:([a-z0-9]+(?:-[a-z0-9]+)*)/g;

/** "iconoir:" NOT followed by a literal name, e.g. `iconoir:${name}` or "iconoir:" + name */
const DYNAMIC_REFERENCE = /iconoir:(?![a-z0-9])/g;

/**
 * Text right after a literal name that shows the name continues dynamically,
 * e.g. `iconoir:heart${suffix}`, `iconoir:nav-arrow-${dir}` or "iconoir:nav-arrow-" + dir
 */
const DYNAMIC_CONTINUATION = /^(?:\$\{|[-_]|["'`]\s*\+)/;

/**
 * Recursively lists the scannable source files below a directory, skipping
 * this folder (the generator and the generated subset itself)
 * @param {string} dir - Absolute directory path
 * @returns {Promise<string[]>} Absolute file paths
 */
async function listSourceFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    /** @type {string[]} */
    const files = [];
    for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (join(path, "/") !== ICONS_DIR) {
                files.push(...(await listSourceFiles(path)));
            }
        } else if (SCANNED_EXTENSIONS.has(extname(entry.name))) {
            files.push(path);
        }
    }
    return files;
}

/**
 * Returns the 1-based line number of a string offset
 * @param {string} text - File content
 * @param {number} index - Character offset
 * @returns {number} Line number
 */
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/**
 * Collects every referenced iconoir icon name, with where it is used
 * @returns {Promise<{names: Map<string, string[]>, dynamic: string[]}>}
 *   names: icon name -> "file:line" locations; dynamic: locations of
 *   references whose name can't be read statically
 */
async function collectIconNames() {
    /** @type {Map<string, string[]>} */
    const names = new Map();
    /** @type {string[]} */
    const dynamic = [];

    for (const file of await listSourceFiles(SRC_DIR)) {
        const content = await readFile(file, "utf8");
        const displayPath = relative(process.cwd(), file);

        for (const match of content.matchAll(ICON_REFERENCE)) {
            const location = `${displayPath}:${lineOf(content, match.index)}`;
            const rest = content.slice(match.index + match[0].length);
            if (DYNAMIC_CONTINUATION.test(rest)) {
                dynamic.push(location);
                continue;
            }
            const locations = names.get(match[1]) ?? [];
            locations.push(location);
            names.set(match[1], locations);
        }
        for (const match of content.matchAll(DYNAMIC_REFERENCE)) {
            dynamic.push(`${displayPath}:${lineOf(content, match.index)}`);
        }
    }

    return { names, dynamic };
}

/**
 * Builds the subset JSON and writes it (or, with --check, verifies it)
 * @returns {Promise<void>}
 */
async function main() {
    const checkOnly = process.argv.includes("--check");
    const { names, dynamic } = await collectIconNames();

    if (dynamic.length > 0) {
        console.error(
            `❌ Dynamically built iconoir icon names can't be bundled - write the full "iconoir:<name>" literal instead:\n   ${dynamic.join("\n   ")}`
        );
        process.exit(1);
    }

    const sortedNames = [...names.keys()].sort();
    if (sortedNames.length === 0) {
        console.error(`❌ No "iconoir:<name>" references found in ${SRC_DIR}`);
        process.exit(1);
    }

    const subset = getIcons(iconoirCollection, sortedNames, true);
    const notFound = subset?.not_found ?? [];
    if (!subset || notFound.length > 0) {
        const details = notFound
            .map((name) => `   iconoir:${name} (${names.get(name)?.join(", ")})`)
            .join("\n");
        console.error(
            `❌ Unknown icon(s) - not in @iconify-json/iconoir:\n${details}\n   Browse https://icon-sets.iconify.design/iconoir/ for valid names.`
        );
        process.exit(1);
    }
    delete subset.not_found;

    const output = `${JSON.stringify(subset, null, 4)}\n`;

    if (checkOnly) {
        const current = await readFile(OUTPUT_FILE, "utf8").catch(() => "");
        if (current !== output) {
            console.error(
                `❌ ${relative(process.cwd(), OUTPUT_FILE)} is out of date - run "pnpm icons"`
            );
            process.exit(1);
        }
        console.log(`✅ Icon subset is up to date (${sortedNames.length} icons)`);
        return;
    }

    await writeFile(OUTPUT_FILE, output);
    console.log(
        `✅ Wrote ${sortedNames.length} icons to ${relative(process.cwd(), OUTPUT_FILE)} (${(
            Buffer.byteLength(output) / 1024
        ).toFixed(1)} KB)`
    );
}

await main();
