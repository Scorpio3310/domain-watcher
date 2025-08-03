/** @type {import('./$types').RequestHandler} */
import DEV_ROBOTS_TXT from "./dev_robots.txt?raw";
import PRODUCTION_ROBOTS_TXT from "./production_robots.txt?raw";
const production_origin = "https://www.your-domain.com";

export async function GET({ url }) {
    const is_prod = url.origin.includes(production_origin);
    const ret = is_prod ? PRODUCTION_ROBOTS_TXT : DEV_ROBOTS_TXT;
    return new Response(ret);
}
