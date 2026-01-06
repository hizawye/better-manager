use axum::{routing::get, Router, Json};
use clap::Parser;
use serde::Serialize;
use std::net::SocketAddr;
use tracing::info;
use tracing_subscriber::{fmt, EnvFilter};

use better_manager::api::api_router;

const DEFAULT_PORT: u16 = 8094;
const DEFAULT_HOST: &str = "127.0.0.1";

/// Better Manager - A lightweight AI account manager and protocol proxy
#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Port to listen on
    #[arg(short, long, default_value_t = DEFAULT_PORT)]
    port: u16,

    /// Host to bind to
    #[arg(long, default_value = DEFAULT_HOST)]
    host: String,

    /// Path to configuration file
    #[arg(short, long)]
    config: Option<String>,

    /// Open browser on start
    #[arg(long, default_value_t = false)]
    open: bool,

    /// Log level (trace, debug, info, warn, error)
    #[arg(long, default_value = "info")]
    log_level: String,
}

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
    // Parse CLI arguments
    let args = Args::parse();

    // Initialize logging
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&args.log_level));

    fmt()
        .with_env_filter(filter)
        .with_target(false)
        .compact()
        .init();

    // Build the router
    let app = Router::new()
        .route("/health", get(health_check))
        .nest("/api", api_router());

    // Bind to address
    let addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .parse()
        .expect("Invalid address");

    info!("🚀 Better Manager v{}", env!("CARGO_PKG_VERSION"));
    info!("   Server: http://{}", addr);
    info!("   Health: http://{}/health", addr);

    if args.open {
        info!("   Opening browser...");
        let url = format!("http://{}", addr);
        let _ = open::that(&url);
    }

    // Start the server
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to address");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}
