/**
 * @fileoverview Small crypto helpers for server-side secret checks.
 * @module CryptoUtils
 */

/**
 * Compares two strings in constant time
 *
 * Both values are hashed with SHA-256 first, so the comparison always runs
 * over 32 bytes and leaks neither the content nor the length of the secret.
 * Works in workerd and Node (`vite dev`) via the Web Crypto API.
 *
 * @function timingSafeEqual
 * @memberof module:CryptoUtils
 * @param {string} a - Value received from the client
 * @param {string} b - Expected secret
 * @returns {Promise<boolean>} Whether both values are equal
 *
 * @example
 * if (!(await timingSafeEqual(header, CRON_SECRET))) {
 *   return new Response("Unauthorized", { status: 401 });
 * }
 */
export async function timingSafeEqual(a, b) {
    const encoder = new TextEncoder();
    const [digestA, digestB] = await Promise.all([
        crypto.subtle.digest("SHA-256", encoder.encode(a)),
        crypto.subtle.digest("SHA-256", encoder.encode(b)),
    ]);
    const bytesA = new Uint8Array(digestA);
    const bytesB = new Uint8Array(digestB);

    let diff = 0;
    for (let i = 0; i < bytesA.length; i++) {
        diff |= bytesA[i] ^ bytesB[i];
    }
    return diff === 0;
}
