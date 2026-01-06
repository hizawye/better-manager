//! Monitor/logging database operations

use super::models::MonitorLog;
use rusqlite::{params, Connection, Result};
use std::time::{SystemTime, UNIX_EPOCH};

/// Get current timestamp in seconds
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

/// Insert a monitor log entry
pub fn insert_log(conn: &Connection, log: &MonitorLog) -> Result<i64> {
    conn.execute(
        "INSERT INTO proxy_monitor_logs (timestamp, method, path, status_code, latency_ms,
                                         account_email, model, input_tokens, output_tokens, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            log.timestamp,
            log.method,
            log.path,
            log.status_code,
            log.latency_ms,
            log.account_email,
            log.model,
            log.input_tokens,
            log.output_tokens,
            log.error_message
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Get recent logs with pagination
pub fn get_logs(conn: &Connection, limit: u32, offset: u32) -> Result<Vec<MonitorLog>> {
    let mut stmt = conn.prepare(
        "SELECT id, timestamp, method, path, status_code, latency_ms,
                account_email, model, input_tokens, output_tokens, error_message
         FROM proxy_monitor_logs
         ORDER BY timestamp DESC
         LIMIT ? OFFSET ?",
    )?;

    let logs = stmt
        .query_map(params![limit, offset], |row| {
            Ok(MonitorLog {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                method: row.get(2)?,
                path: row.get(3)?,
                status_code: row.get(4)?,
                latency_ms: row.get(5)?,
                account_email: row.get(6)?,
                model: row.get(7)?,
                input_tokens: row.get(8)?,
                output_tokens: row.get(9)?,
                error_message: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>>>()?;

    Ok(logs)
}

/// Get total log count
pub fn get_log_count(conn: &Connection) -> Result<u64> {
    conn.query_row(
        "SELECT COUNT(*) FROM proxy_monitor_logs",
        [],
        |row| row.get(0),
    )
}

/// Clear all logs
pub fn clear_logs(conn: &Connection) -> Result<u64> {
    let count = get_log_count(conn)?;
    conn.execute("DELETE FROM proxy_monitor_logs", [])?;
    Ok(count)
}

/// Clear logs older than a given timestamp
pub fn clear_logs_before(conn: &Connection, before: i64) -> Result<u64> {
    let rows = conn.execute(
        "DELETE FROM proxy_monitor_logs WHERE timestamp < ?",
        [before],
    )?;
    Ok(rows as u64)
}

/// Get stats summary
pub fn get_stats(conn: &Connection) -> Result<LogStats> {
    let total_requests: u64 = conn
        .query_row("SELECT COUNT(*) FROM proxy_monitor_logs", [], |row| row.get(0))
        .unwrap_or(0);

    let success_count: u64 = conn
        .query_row(
            "SELECT COUNT(*) FROM proxy_monitor_logs WHERE status_code < 400",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let error_count: u64 = conn
        .query_row(
            "SELECT COUNT(*) FROM proxy_monitor_logs WHERE status_code >= 400",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let avg_latency: f64 = conn
        .query_row(
            "SELECT COALESCE(AVG(latency_ms), 0) FROM proxy_monitor_logs",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    let total_input_tokens: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(input_tokens), 0) FROM proxy_monitor_logs",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let total_output_tokens: i64 = conn
        .query_row(
            "SELECT COALESCE(SUM(output_tokens), 0) FROM proxy_monitor_logs",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LogStats {
        total_requests,
        success_count,
        error_count,
        avg_latency_ms: avg_latency as u32,
        total_input_tokens,
        total_output_tokens,
    })
}

/// Log statistics summary
#[derive(Debug, serde::Serialize)]
pub struct LogStats {
    pub total_requests: u64,
    pub success_count: u64,
    pub error_count: u64,
    pub avg_latency_ms: u32,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
}
