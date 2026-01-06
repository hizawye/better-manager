use axum::{routing::get, Router, Json};
use serde::Serialize;
use std::net::SocketAddr;

const DEFAULT_PORT: u16 = 8094;
const DEFAULT_HOST: &str = "127.0.0.1";

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
}

async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[tokio::main]
async fn main() {
    // Build the router
    let app = Router::new()
        .route("/health", get(health_check));

    // Bind to address
    let addr: SocketAddr = format!("{}:{}", DEFAULT_HOST, DEFAULT_PORT)
        .parse()
        .expect("Invalid address");

    println!("🚀 Better Manager starting on http://{}", addr);
    println!("   Health check: http://{}/health", addr);

    // Start the server
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to address");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}
