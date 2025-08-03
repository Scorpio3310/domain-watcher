import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [tailwindcss(), sveltekit()],
    define: {
        __VERSION__: JSON.stringify(process.env.npm_package_version),
    },
});
