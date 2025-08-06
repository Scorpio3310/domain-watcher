import { apiKey } from "$src/lib/server/infrastructure/api-key.js";

export async function load() {
    const isApiConfigured = await apiKey.isConfigured().catch(() => false);

    return {
        isApiConfigured,
    };
}
