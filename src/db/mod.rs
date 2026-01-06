//! Database module for SQLite operations

mod accounts;
mod config;
mod connection;
mod migrations;
mod models;
mod monitor;

pub use accounts::{
    delete_account, get_account_by_id, get_active_accounts, get_all_accounts,
    get_current_account, save_account, set_current_account, toggle_account_active,
};
pub use config::{
    delete_app_config, get_all_app_config, get_app_config, get_proxy_config, save_app_config,
    save_proxy_config,
};
pub use connection::{get_default_db_path, Database};
pub use migrations::run_migrations;
pub use models::{Account, AppConfig, MonitorLog, ProxyConfig, QuotaInfo};
pub use monitor::{clear_logs, get_log_count, get_logs, get_stats, insert_log, LogStats};
