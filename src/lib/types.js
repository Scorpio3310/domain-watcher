/**
 * @fileoverview Central JSDoc type definitions shared across the app.
 * Consume from .js files via `@import` and from .svelte files via inline
 * `import('$lib/types')` type expressions.
 */

/**
 * Standard result object returned by services and remote functions
 * @typedef {Object} ServiceResult
 * @property {number} status - HTTP-like status code
 * @property {string} message - Human-readable message
 * @property {any} [data] - Optional payload
 * @property {string} [originalMessage] - Raw upstream error message (e.g. from WHOIS API)
 * @property {{total: number, successful: number, errors: number, successRate: number}} [results] - Batch operation summary
 */

/**
 * Row from the `domains` table (see schema.sql)
 * @typedef {Object} DomainRecord
 * @property {number} id - Unique domain identifier
 * @property {string} domain_name - The domain name
 * @property {string} [status] - Domain status (not_checked, available, registered, error)
 * @property {string|null} [expires] - Domain expiration date
 * @property {string|null} [raw_domain_data] - Raw WHOIS response JSON string
 * @property {string|null} [raw_ns_data] - Raw DNS/NS response JSON string
 * @property {string|null} [raw_ssl_data] - Raw SSL certificate response JSON string
 * @property {string|null} [error_message] - Last error message for failed checks
 * @property {number} [check_count] - How many times the domain was checked
 * @property {string|null} [last_domain_checked] - When the last API call was made
 * @property {string} [created_at] - Record creation timestamp
 * @property {string} [updated_at] - Record last update timestamp
 * @property {string|null} [registrar] - Registrar name (derived for UI, not a table column)
 */

/**
 * Access/demo-mode validation error
 * @typedef {Object} ValidationError
 * @property {number} status - HTTP status code (403 demo mode, 400 missing API key)
 * @property {string} message - Human-readable error message
 */

/**
 * Result of verifying a single domain
 * @typedef {Object} VerificationResult
 * @property {boolean} success - Whether verification completed successfully
 * @property {string} domain - The domain name that was checked
 * @property {string} [status] - Domain status (available, registered, error)
 * @property {boolean} [wasAvailable] - True if domain is now available
 * @property {boolean} [isStillRegistered] - True if domain remains registered
 * @property {string} [error] - Error message if verification failed
 */

/**
 * Options for batch domain verification
 * @typedef {Object} BatchOptions
 * @property {number} [delayBetweenDomains] - Delay between batches in milliseconds
 * @property {number} [batchSize] - Number of domains to process per batch
 */

/**
 * Aggregate result of a batch verification run
 * @typedef {Object} BatchVerificationResult
 * @property {number} checked - Total number of domains processed
 * @property {DomainRecord[]} available - Domains that became available
 * @property {DomainRecord[]} stillRegistered - Expired domains still registered
 * @property {number} errors - Number of domains that failed verification
 * @property {string[]} errorMessages - Detailed error messages for failed verifications
 */

/**
 * Domains grouped by expiration state for cron notifications
 * @typedef {Object} CategorizedDomains
 * @property {DomainRecord[]} expired - Domains past their expiration date
 * @property {DomainRecord[]} expiring - Domains expiring within the notice window
 * @property {DomainRecord[]} active - Remaining active domains
 */

/**
 * Domain updates payload passed to notification providers
 * @typedef {Object} DomainUpdates
 * @property {DomainRecord[]} available - Domains that became available
 * @property {DomainRecord[]} expiring - Domains expiring soon
 * @property {DomainRecord[]} expired - Expired domains still registered
 * @property {number} totalCount - Total number of domains in the report
 */

/**
 * Result returned by a notification provider send operation
 * @typedef {Object} NotifierResult
 * @property {boolean} success - Whether the notification was delivered
 * @property {string} [message] - Optional status or error message
 */

/**
 * WhoisJSON API key configuration (settings: api/who_is_json)
 * @typedef {Object} ApiKeyConfig
 * @property {string} api_key - The WhoisJSON API key
 * @property {string} [connection_status] - Last connection test status
 * @property {string|null} [connection_verified_at] - When the connection was last verified
 * @property {number} [version] - Config schema version
 */

/**
 * Slack notification configuration (settings: notifications/slack)
 * @typedef {Object} SlackConfig
 * @property {string} webhook_url - Slack incoming webhook URL
 * @property {string} [notification_time] - Daily notification time (HH:mm)
 * @property {string} [connection_status] - Last connection test status
 * @property {string|null} [connection_verified_at] - When the connection was last verified
 * @property {number} [version] - Config schema version
 */

/**
 * Resend email notification configuration (settings: notifications/resend)
 * @typedef {Object} ResendConfig
 * @property {string} api_key - Resend API key
 * @property {string} from_email - Sender email address
 * @property {string} to_email - Recipient email address
 * @property {string} [notification_time] - Daily notification time (HH:mm)
 * @property {string} [connection_status] - Last connection test status
 * @property {string|null} [connection_verified_at] - When the connection was last verified
 * @property {number} [version] - Config schema version
 */

/**
 * Provider settings as loaded for cron notification dispatch
 * @typedef {Object} ProviderSettings
 * @property {boolean} enabled - Whether the provider is enabled
 * @property {string} [webhook_url] - Slack webhook URL
 * @property {string} [api_key] - Resend API key
 * @property {string} [from_email] - Sender email address
 * @property {string} [to_email] - Recipient email address
 * @property {string} [notification_time] - Daily notification time (HH:mm)
 * @property {string} [connection_status] - Last connection test status
 * @property {string} [error] - Set when loading/parsing the settings failed (provider is NOT just disabled)
 */

/**
 * Payload shown by the global toast (remote form result shape)
 * @typedef {Object} ToastPayload
 * @property {number} status - HTTP-like status code (2xx renders as success)
 * @property {string} message - Message text to display
 */

/**
 * Expiration analysis with UI styling info (see getExpirationStatus)
 * @typedef {Object} ExpirationStatus
 * @property {('expired'|'expiring_soon'|'unknown'|undefined)} status - Current expiration status category
 * @property {number|null} daysRemaining - Absolute days until/since expiration (always positive)
 * @property {boolean} isExpired - True if domain has already expired
 * @property {boolean} isExpiringSoon - True if expires within 30 days (and not expired)
 * @property {string} className - CSS class name for conditional styling
 */

/**
 * Slack Block Kit block (subset used by the notifier)
 * @typedef {Object} SlackBlock
 * @property {string} type - Block type (section, context, divider, ...)
 * @property {{type: string, text: string}} [text] - Block text object
 * @property {Array<{type: string, text: string}>} [elements] - Context elements
 */

export {};
