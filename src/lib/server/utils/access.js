/**
 * @fileoverview Shared access validation for server-side write operations.
 * Single source of truth for demo-mode gating, used by services,
 * infrastructure clients and the cron endpoint.
 * @module AccessUtils
 */

import { isDemo } from "#lib/utils/helpers.js";

/** @import { ValidationError } from "#lib/types.js" */

/**
 * Validates if the application is not in demo mode.
 * Used for operations that modify data but don't require API key validation.
 *
 * @function validateDemoMode
 * @memberof module:AccessUtils
 * @returns {ValidationError|null} Error object if in demo mode, null otherwise
 *
 * @example
 * ```javascript
 * const demoError = validateDemoMode();
 * if (demoError) {
 *   return demoError;
 * }
 * // Proceed with write operations...
 * ```
 *
 */
export const validateDemoMode = () =>
    isDemo()
        ? { status: 403, message: "Demo mode: Look but don't touch 👀" }
        : null;
