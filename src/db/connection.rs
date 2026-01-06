//! Database connection management

use directories::ProjectDirs;
use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tracing::{debug, info};

/// Get the default database path for the current platform
pub fn get_default_db_path() -> PathBuf {
    if let Some(proj_dirs) = ProjectDirs::from("com", "nagara", "better-manager") {
        let data_dir = proj_dirs.data_dir();
        std::fs::create_dir_all(data_dir).ok();
        data_dir.join("data.db")
    } else {
        // Fallback to current directory
        PathBuf::from("better-manager.db")
    }
}

/// Database wrapper for shared access
#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
    path: PathBuf,
}

impl Database {
    /// Open or create a database at the given path
    pub fn open(path: Option<PathBuf>) -> Result<Self> {
        let db_path = path.unwrap_or_else(get_default_db_path);

        debug!("Opening database at: {:?}", db_path);

        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(&db_path)?;

        // Enable WAL mode for better concurrency
        conn.execute_batch("PRAGMA journal_mode=WAL;")?;

        info!("Database opened: {:?}", db_path);

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            path: db_path,
        })
    }

    /// Get the database path
    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    /// Execute a function with the connection
    pub fn with_conn<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&Connection) -> Result<T>,
    {
        let conn = self.conn.lock().unwrap();
        f(&conn)
    }

    /// Execute a function with mutable connection
    pub fn with_conn_mut<F, T>(&self, f: F) -> Result<T>
    where
        F: FnOnce(&mut Connection) -> Result<T>,
    {
        let mut conn = self.conn.lock().unwrap();
        f(&mut conn)
    }
}
