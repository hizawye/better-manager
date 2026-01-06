//! REST API module for dashboard endpoints

mod accounts;
mod routes;
mod state;

pub use routes::api_router;
pub use state::AppState;
