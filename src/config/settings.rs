//! Application settings and configuration

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Default port for the server
pub const DEFAULT_PORT: u16 = 8094;

/// Default host for the server
pub const DEFAULT_HOST: &str = "127.0.0.1";

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    /// Server host
    pub host: String,

    /// Server port
    pub port: u16,

    /// Database path (optional, defaults to platform-specific location)
    pub db_path: Option<PathBuf>,

    /// Enable LAN access (bind to 0.0.0.0)
    pub allow_lan_access: bool,

    /// Require API key authentication
    pub require_auth: bool,

    /// API key for authentication (if require_auth is true)
    pub api_key: Option<String>,

    /// Auto-open browser on start
    pub open_browser: bool,

    /// Log level (trace, debug, info, warn, error)
    pub log_level: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            host: DEFAULT_HOST.to_string(),
            port: DEFAULT_PORT,
            db_path: None,
            allow_lan_access: false,
            require_auth: false,
            api_key: None,
            open_browser: false,
            log_level: "info".to_string(),
        }
    }
}

impl Settings {
    /// Create settings from CLI arguments
    pub fn from_args(host: String, port: u16, config_path: Option<String>, open: bool) -> Self {
        let mut settings = if let Some(path) = config_path {
            Self::load_from_file(&path).unwrap_or_default()
        } else {
            Self::default()
        };

        // CLI args override config file
        settings.host = host;
        settings.port = port;
        settings.open_browser = open;

        settings
    }

    /// Load settings from a TOML file
    pub fn load_from_file(path: &str) -> Option<Self> {
        let content = std::fs::read_to_string(path).ok()?;
        toml::from_str(&content).ok()
    }

    /// Get the effective host to bind to
    pub fn bind_host(&self) -> &str {
        if self.allow_lan_access {
            "0.0.0.0"
        } else {
            &self.host
        }
    }

    /// Get the full server URL
    pub fn server_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }
}
