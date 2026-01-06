//! Configuration API endpoints

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, put},
    Json, Router,
};

use super::state::AppState;
use crate::db::{self, ProxyConfig};

/// Build config routes
pub fn config_routes() -> Router<AppState> {
    Router::new()
        .route("/proxy", get(get_proxy_config))
        .route("/proxy", put(update_proxy_config))
}

/// Get proxy configuration
async fn get_proxy_config(
    State(state): State<AppState>,
) -> Result<Json<ProxyConfig>, StatusCode> {
    let config = state
        .db
        .with_conn(|conn| db::get_proxy_config(conn))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(config))
}

/// Update proxy configuration
async fn update_proxy_config(
    State(state): State<AppState>,
    Json(config): Json<ProxyConfig>,
) -> Result<StatusCode, StatusCode> {
    state
        .db
        .with_conn(|conn| db::save_proxy_config(conn, &config))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(StatusCode::OK)
}
