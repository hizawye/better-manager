//! Database module for SQLite operations

mod connection;

pub use connection::{get_default_db_path, Database};
