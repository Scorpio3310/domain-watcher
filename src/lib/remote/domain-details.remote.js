/**
 * @fileoverview Remote query for the raw lookup data of a single domain.
 * The home page list ships only what a card shows up front; the raw
 * RDAP/WhoisJSON envelope plus NS and SSL responses are fetched here, on
 * demand, when a domain card is expanded.
 * @module DomainDetailsRemote
 */

import { query } from "$app/server";
import { z } from "zod/v4";
import { domains } from "#lib/server/services/domain.js";

/**
 * Domain ID argument - same bounds as domainIdFormSchema, but a real number
 * (no string coercion: query arguments are serialized with their type)
 */
const domainIdSchema = z.number().int().positive().max(9999999);

/**
 * Loads the raw lookup JSON an expanded domain card shows. The card's forms
 * (NS/SSL lookup, scan, delete) refresh every active query after a
 * successful submission, so an open card picks up new data without extra
 * wiring. A missing domain resolves to null rather than a 404: right after a
 * delete, the refresh of the removed card's query races the page data reload
 * that drops the card, and an error there would only flash on its way out.
 *
 * @function getDomainDetails
 * @memberof module:DomainDetailsRemote
 * @returns {Promise<import('#lib/server/services/domain.js').DomainDetails|null>}
 *   Raw JSON strings (null for data never fetched), or null when the domain
 *   no longer exists
 */
export const getDomainDetails = query(domainIdSchema, (domainId) =>
    domains.getDetails(domainId)
);
