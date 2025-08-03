import { sequence } from "@sveltejs/kit/hooks";
import { initDatabase } from "$src/lib/database/db.js";

export async function handle_db_connect({ event, resolve }) {
    // Only initialize if D1 database binding exists (Cloudflare Workers environment)
    if (event?.platform?.env?.DB) {
        initDatabase(event.platform.env.DB);
    }
    return await resolve(event);
}

export const handle = sequence(handle_db_connect);
