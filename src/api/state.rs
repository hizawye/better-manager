//! Shared application state

use crate::db::Database;
use std::sync::Arc;

/// Shared application state
#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
}

impl AppState {
    pub fn new(db: Database) -> Self {
        Self { db: Arc::new(db) }
    }
}
