//! API routes configuration

use axum::{routing::get, Router};

use super::accounts::account_routes;
use super::config::config_routes;
use super::monitor::monitor_routes;
use super::state::AppState;

/// Build the API router
pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .nest("/accounts", account_routes())
        .nest("/config", config_routes())
        .nest("/monitor", monitor_routes())
}

/// API health check
async fn health() -> &'static str {
    "ok"
}
