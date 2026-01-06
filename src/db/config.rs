//! Configuration database operations

use super::models::{AppConfig, ProxyConfig};
use rusqlite::{params, Connection, OptionalExtension, Result};
use std::time::{SystemTime, UNIX_EPOCH};

/// Get current timestamp in seconds
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Get an app config value by key
pub fn get_app_config(conn: &Connection, key: &str) -> Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM app_config WHERE key = ?",
        [key],
        |row| row.get(0),
    )
    .optional()
}

/// Save an app config value
pub fn save_app_config(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO app_config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Delete an app config value
pub fn delete_app_config(conn: &Connection, key: &str) -> Result<bool> {
    let rows = conn.execute("DELETE FROM app_config WHERE key = ?", [key])?;
    Ok(rows > 0)
}

/// Get all app config entries
pub fn get_all_app_config(conn: &Connection) -> Result<Vec<AppConfig>> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_config")?;
    let configs = stmt
        .query_map([], |row| {
            Ok(AppConfig {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    Ok(configs)
}

/// Get proxy configuration
pub fn get_proxy_config(conn: &Connection) -> Result<ProxyConfig> {
    let result: Option<ProxyConfig> = conn
        .query_row(
            "SELECT id, enabled, host, port, scheduling_mode, session_stickiness,
                    allowed_models, api_key, created_at, updated_at
             FROM proxy_config WHERE id = 1",
            [],
            |row| {
                let models_json: String = row.get(6)?;
                let allowed_models: Vec<String> =
                    serde_json::from_str(&models_json).unwrap_or_default();

                Ok(ProxyConfig {
                    id: row.get(0)?,
                    enabled: row.get::<_, i32>(1)? != 0,
                    host: row.get(2)?,
                    port: row.get::<_, i32>(3)? as u16,
                    scheduling_mode: row.get(4)?,
                    session_stickiness: row.get::<_, i32>(5)? != 0,
                    allowed_models,
                    api_key: row.get(7)?,
                    created_at: row.get(8)?,
                    updated_at: row.get(9)?,
                })
            },
        )
        .optional()?;

    match result {
        Some(config) => Ok(config),
        None => {
            // Create default config
            let config = ProxyConfig::default();
            save_proxy_config(conn, &config)?;
            Ok(config)
        }
    }
}

/// Save proxy configuration
pub fn save_proxy_config(conn: &Connection, config: &ProxyConfig) -> Result<()> {
    let now = now();
    let models_json = serde_json::to_string(&config.allowed_models).unwrap_or_default();

    conn.execute(
        "INSERT INTO proxy_config (id, enabled, host, port, scheduling_mode, session_stickiness,
                                   allowed_models, api_key, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
             enabled = excluded.enabled,
             host = excluded.host,
             port = excluded.port,
             scheduling_mode = excluded.scheduling_mode,
             session_stickiness = excluded.session_stickiness,
             allowed_models = excluded.allowed_models,
             api_key = excluded.api_key,
             updated_at = excluded.updated_at",
        params![
            config.enabled as i32,
            config.host,
            config.port as i32,
            config.scheduling_mode,
            config.session_stickiness as i32,
            models_json,
            config.api_key,
            now,
            now
        ],
    )?;
    Ok(())
}
