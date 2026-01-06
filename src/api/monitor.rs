//! Monitor API endpoints

use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::{delete, get},
    Json, Router,
};
use serde::Deserialize;

use super::state::AppState;
use crate::db::{self, LogStats, MonitorLog};

/// Pagination query params
#[derive(Debug, Deserialize)]
pub struct PaginationParams {
    #[serde(default = "default_limit")]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
}

fn default_limit() -> u32 {
    50
}

/// Logs response with pagination info
#[derive(Debug, serde::Serialize)]
pub struct LogsResponse {
    pub logs: Vec<MonitorLog>,
    pub total: u64,
    pub limit: u32,
    pub offset: u32,
}

/// Build monitor routes
pub fn monitor_routes() -> Router<AppState> {
    Router::new()
        .route("/logs", get(get_logs))
        .route("/logs", delete(clear_logs))
        .route("/stats", get(get_stats))
}

/// Get logs with pagination
async fn get_logs(
    State(state): State<AppState>,
    Query(params): Query<PaginationParams>,
) -> Result<Json<LogsResponse>, StatusCode> {
    let logs = state
        .db
        .with_conn(|conn| db::get_logs(conn, params.limit, params.offset))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total = state
        .db
        .with_conn(|conn| db::get_log_count(conn))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(LogsResponse {
        logs,
        total,
        limit: params.limit,
        offset: params.offset,
    }))
}

/// Clear all logs
async fn clear_logs(State(state): State<AppState>) -> Result<Json<serde_json::Value>, StatusCode> {
    let count = state
        .db
        .with_conn(|conn| db::clear_logs(conn))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({ "deleted": count })))
}

/// Get statistics
async fn get_stats(State(state): State<AppState>) -> Result<Json<LogStats>, StatusCode> {
    let stats = state
        .db
        .with_conn(|conn| db::get_stats(conn))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(stats))
}
