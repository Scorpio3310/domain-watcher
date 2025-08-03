import { dev } from "$app/environment";
import { error } from "@sveltejs/kit";

export async function load() {
    // Development only - throw 404 in production
    if (!dev) {
        throw error(404, "Page not found");
    }

    return {};
}
