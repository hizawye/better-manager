//! Database migrations

use rusqlite::{Connection, Result};
use tracing::info;

/// Current schema version
const SCHEMA_VERSION: i32 = 1;

/// Run all migrations
pub fn run_migrations(conn: &Connection) -> Result<()> {
    let current_version = get_schema_version(conn)?;

    if current_version < SCHEMA_VERSION {
        info!("Running database migrations (v{} -> v{})", current_version, SCHEMA_VERSION);
    }

    if current_version < 1 {
        migrate_v1(conn)?;
    }

    Ok(())
}

/// Get the current schema version
fn get_schema_version(conn: &Connection) -> Result<i32> {
    // Create version table if not exists
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    )?;

    let version: i32 = conn
        .query_row("SELECT version FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0);

    Ok(version)
}

/// Set the schema version
fn set_schema_version(conn: &Connection, version: i32) -> Result<()> {
    conn.execute("DELETE FROM schema_version", [])?;
    conn.execute("INSERT INTO schema_version (version) VALUES (?)", [version])?;
    Ok(())
}

/// Migration v1: Initial schema
fn migrate_v1(conn: &Connection) -> Result<()> {
    info!("Applying migration v1: Initial schema");

    // Accounts table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            display_name TEXT,
            photo_url TEXT,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    // Current account table (which account is "selected")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS current_account (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
        )",
        [],
    )?;
    conn.execute(
        "INSERT OR IGNORE INTO current_account (id, account_id) VALUES (1, NULL)",
        [],
    )?;

    // Quota info table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS quota_info (
            account_id INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
            input_quota INTEGER NOT NULL DEFAULT 0,
            input_used INTEGER NOT NULL DEFAULT 0,
            output_quota INTEGER NOT NULL DEFAULT 0,
            output_used INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    // App config key-value store
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )?;

    // Proxy config
    conn.execute(
        "CREATE TABLE IF NOT EXISTS proxy_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            enabled INTEGER NOT NULL DEFAULT 0,
            host TEXT NOT NULL DEFAULT '127.0.0.1',
            port INTEGER NOT NULL DEFAULT 8094,
            scheduling_mode TEXT NOT NULL DEFAULT 'cache-first',
            session_stickiness INTEGER NOT NULL DEFAULT 1,
            allowed_models TEXT NOT NULL DEFAULT '[]',
            api_key TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )",
        [],
    )?;

    // Proxy monitor logs
    conn.execute(
        "CREATE TABLE IF NOT EXISTS proxy_monitor_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            latency_ms INTEGER NOT NULL,
            account_email TEXT,
            model TEXT,
            input_tokens INTEGER,
            output_tokens INTEGER,
            error_message TEXT
        )",
        [],
    )?;

    // Index for faster log queries
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON proxy_monitor_logs(timestamp DESC)",
        [],
    )?;

    set_schema_version(conn, 1)?;
    info!("Migration v1 complete");

    Ok(())
}
