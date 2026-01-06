//! Database models for application data

use serde::{Deserialize, Serialize};

/// Represents a Google account with OAuth tokens
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: i64,
    pub email: String,
    pub display_name: Option<String>,
    pub photo_url: Option<String>,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub is_active: bool,
    pub sort_order: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Quota information for an account
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaInfo {
    pub account_id: i64,
    pub input_quota: i64,
    pub input_used: i64,
    pub output_quota: i64,
    pub output_used: i64,
    pub updated_at: i64,
}

/// Proxy server configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub id: i64,
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub scheduling_mode: String, // "cache-first", "balanced", "performance"
    pub session_stickiness: bool,
    pub allowed_models: Vec<String>,
    pub api_key: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            id: 1,
            enabled: false,
            host: "127.0.0.1".to_string(),
            port: 8094,
            scheduling_mode: "cache-first".to_string(),
            session_stickiness: true,
            allowed_models: vec![],
            api_key: None,
            created_at: 0,
            updated_at: 0,
        }
    }
}

/// Log entry for proxy requests
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorLog {
    pub id: i64,
    pub timestamp: i64,
    pub method: String,
    pub path: String,
    pub status_code: u16,
    pub latency_ms: u32,
    pub account_email: Option<String>,
    pub model: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub error_message: Option<String>,
}

/// Application configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub key: String,
    pub value: String,
}
