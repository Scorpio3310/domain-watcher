import { PRODUCTION_DOMAIN, ALLOW_ROBOTS } from "$env/static/private";
import DEV_ROBOTS_TXT from "./dev_robots.txt?raw";
import PRODUCTION_ROBOTS_TXT from "./production_robots.txt?raw";

export async function GET({ url }) {
    const isProd = url.origin.includes(PRODUCTION_DOMAIN);

    const allowRobots = ALLOW_ROBOTS === "true";

    // Show production robots only if BOTH conditions are met
    const showProductionRobots = isProd && allowRobots;
    const robotsContent = showProductionRobots
        ? PRODUCTION_ROBOTS_TXT
        : DEV_ROBOTS_TXT;

    return new Response(robotsContent);
}
