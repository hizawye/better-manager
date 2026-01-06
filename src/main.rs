use axum::{routing::get, Router, Json};
use clap::Parser;
use serde::Serialize;
use std::net::SocketAddr;

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

    // Build the router
    let app = Router::new()
        .route("/health", get(health_check));

    // Bind to address
    let addr: SocketAddr = format!("{}:{}", args.host, args.port)
        .parse()
        .expect("Invalid address");

    println!("🚀 Better Manager v{}", env!("CARGO_PKG_VERSION"));
    println!("   Server: http://{}", addr);
    println!("   Health: http://{}/health", addr);

    if args.open {
        println!("   Opening browser...");
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
