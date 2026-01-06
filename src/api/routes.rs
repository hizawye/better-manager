//! API routes configuration

use axum::{routing::get, Router};

/// Build the API router
pub fn api_router() -> Router {
    Router::new()
        .route("/health", get(health))
}

/// API health check
async fn health() -> &'static str {
    "ok"
}
