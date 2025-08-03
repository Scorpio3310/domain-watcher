// ========================================
// TYPE DEFINITIONS
// ========================================

/**
 * Cloudflare D1 prepared statement interface
 * @typedef {Object} D1PreparedStatement
 * @property {function(Array<any>=): Promise<D1Result>} run - Execute statement and return result metadata
 * @property {function(Array<any>=): Promise<D1Result>} all - Execute statement and return all results
 * @property {function(Array<any>=): Promise<Object|null>} first - Execute statement and return first result only
 * @property {function(...any): D1PreparedStatement} bind - Bind parameters to prepared statement
 */

/**
 * Cloudflare D1 query result object
 * @typedef {Object} D1Result
 * @property {Array<Object>} [results] - Array of result rows (for SELECT queries)
 * @property {boolean} [success] - Whether the operation was successful
 * @property {Object} [meta] - Result metadata
 * @property {number} [meta.changes] - Number of rows affected (INSERT/UPDATE/DELETE)
 * @property {number} [meta.last_row_id] - ID of last inserted row
 * @property {number} [meta.rows_read] - Number of rows read
 * @property {number} [meta.rows_written] - Number of rows written
 * @property {string} [error] - Error message if operation failed
 */

/**
 * Cloudflare D1 database interface
 * @typedef {Object} D1Database
 * @property {function(string): D1PreparedStatement} prepare - Create a prepared statement
 * @property {function(Array<D1PreparedStatement>): Promise<Array<D1Result>>} batch - Execute multiple statements in transaction
 * @property {function(string): Promise<D1Result>} exec - Execute raw SQL (for schema operations)
 */

/**
 * Batch statement configuration
 * @typedef {Object} BatchStatement
 * @property {string} sql - SQL statement to execute
 * @property {Array<any>} [params] - Optional parameters for the statement
 */

// ========================================
// CUSTOM ERROR CLASSES
// ========================================

/**
 * Custom error class for database-related failures with HTTP status support
 * @class DatabaseError
 * @extends Error
 */
class DatabaseError extends Error {
    /**
     * Create a database error
     * @param {string} message - Error message
     * @param {number} [status=500] - HTTP status code for the error
     * @param {Object} [details] - Additional error details
     */
    constructor(message, status = 500, details = {}) {
        super(message);
        this.name = "DatabaseError";
        this.status = status;
        this.details = details;

        // Maintain proper stack trace for where error was thrown (V8 only)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, DatabaseError);
        }
    }
}

// ========================================
// DATABASE CONNECTION MANAGEMENT
// ========================================

/**
 * Singleton database instance
 * @type {D1Database | null}
 * @private
 */
let db = null;

/**
 * Initialize the D1 database connection
 * @param {D1Database} d1Database - Cloudflare D1 database instance
 */
export function initDatabase(d1Database) {
    if (!db && d1Database) {
        db = d1Database;
        console.log("✅ D1 Database connected");
    }
}

/**
 * Get the current database instance with proper error handling
 * @returns {D1Database} The active D1 database instance
 * @throws {DatabaseError} HTTP 503 error if database is not initialized
 * @example
 * // Usage in service functions
 * const database = getDatabase();
 * const stmt = database.prepare("SELECT * FROM domains");
 */
export function getDatabase() {
    if (!db) {
        console.warn(
            "⚠️ Database not initialized. Make sure D1 is configured in your environment."
        );

        throw new DatabaseError(
            "⚠️ Database not initialized. Make sure D1 is configured in your environment - Check your wrangler.toml and platform environment configuration",
            503
        );
    }
    return db;
}

/**
 * Execute any SQL query (SELECT, INSERT, UPDATE, DELETE) and return the result
 * @param {string} sql - SQL query or command
 * @param {Array<any>} params - Query parameters for prepared statement
 * @returns {Promise<any>} Query or command result
 * @example
 * // Get all domains
 * const data = await executeSql("SELECT * FROM domains");
 * console.log(data.results); // Array of domains
 *
 * @example
 * // Get specific domain
 * const data = await executeSql("SELECT * FROM domains WHERE domain_name = ?", ["example.com"]);
 * console.log(data.results);
 *
 * @example
 * // Insert new domain
 * const result = await executeSql("INSERT INTO domains (domain_name) VALUES (?)", ["example.com"]);
 * console.log("New domain ID:", result.meta.last_row_id);
 *
 * @example
 * // Update domain status
 * const result = await executeSql("UPDATE domains SET status = ? WHERE id = ?", [1, 123]);
 * console.log("Rows updated:", result.meta.changes);
 *
 * @example
 * // Delete domain
 * const result = await executeSql("DELETE FROM domains WHERE id = ?", [123]);
 * console.log("Rows deleted:", result.meta.changes);
 */
export async function executeSql(sql, params = []) {
    const database = getDatabase();
    try {
        const stmt = database.prepare(sql);
        const result =
            params.length > 0
                ? await stmt.bind(...params).run()
                : await stmt.run();
        return result;
    } catch (error) {
        console.error("❌ Database query failed:", error);
        throw new DatabaseError(error?.message || "Database query failed", 503);
    }
}

/**
 * Execute a SELECT query and return only the first result
 * @param {string} sql - SQL SELECT query
 * @param {Array<any>} params - Query parameters for prepared statement
 * @returns {Promise<Object|null>} First result or null if no results
 * @example
 * // Get single domain by ID
 * const domain = await executeQueryFirst("SELECT * FROM domains WHERE id = ?", [123]);
 * if (domain) {
 *     console.log(domain.domain_name);
 * }
 */
export async function executeQueryFirst(sql, params = []) {
    const database = getDatabase();
    try {
        const stmt = database.prepare(sql);
        const result =
            params.length > 0
                ? await stmt.bind(...params).first()
                : await stmt.first();
        return result;
    } catch (error) {
        console.error("❌ Database query failed:", error);
        throw new DatabaseError(error?.message || "Database query failed", 503);
    }
}

/**
 * Execute multiple statements in a batch transaction
 * @param {Array<{sql: string, params?: Array<any>}>} statements - Array of SQL statements with optional parameters
 * @returns {Promise<Array<any>>} Array of results for each statement
 * @example
 * // Insert multiple domains at once
 * const results = await executeBatch([
 *     { sql: "INSERT INTO domains (domain_name) VALUES (?)", params: ["example1.com"] },
 *     { sql: "INSERT INTO domains (domain_name) VALUES (?)", params: ["example2.com"] },
 *     { sql: "INSERT INTO domains (domain_name) VALUES (?)", params: ["example3.com"] }
 * ]);
 * console.log("Inserted", results.length, "domains");
 *
 * @example
 * // Mixed operations in transaction
 * const results = await executeBatch([
 *     { sql: "UPDATE domains SET status = 1 WHERE id = ?", params: [123] },
 *     { sql: "INSERT INTO domain_logs (domain_id, action) VALUES (?, ?)", params: [123, "checked"] }
 * ]);
 */
export async function executeBatch(statements) {
    const database = getDatabase();
    try {
        const preparedStatements = statements.map(({ sql, params = [] }) => {
            const stmt = database.prepare(sql);
            return params.length > 0 ? stmt.bind(...params) : stmt;
        });
        const results = await database.batch(preparedStatements);
        return results;
    } catch (error) {
        console.error("❌ Database batch failed:", error);
        throw new DatabaseError(error?.message || "Database query failed", 503);
    }
}
