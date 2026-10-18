import adapter from "@sveltejs/adapter-cloudflare";
import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [
        tailwindcss(),
        sveltekit({
            // See https://svelte.dev/docs/kit/adapters for more information about adapters.
            adapter: adapter(),
            experimental: {
                remoteFunctions: true,
            },
            compilerOptions: {
                experimental: {
                    async: true,
                },
            },
            inspector: {
                showToggleButton: "always",
                toggleButtonPos: "bottom-right",
            },
        }),
    ],
    define: {
        __VERSION__: JSON.stringify(process.env.npm_package_version),
    },
});
