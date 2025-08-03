/** @type {import('./$types').RequestHandler} */
import DEV_ROBOTS_TXT from "./dev_robots.txt?raw";
import PRODUCTION_ROBOTS_TXT from "./production_robots.txt?raw";
const PRODUCTION_DOMAIN = "https://domain-watcher.klemenc.dev"; // Replace with your actual production origin

export async function GET({ url }) {
    const isProd = url.origin.includes(PRODUCTION_DOMAIN);
    const robotsContent = isProd ? PRODUCTION_ROBOTS_TXT : DEV_ROBOTS_TXT;
    return new Response(robotsContent);
}
