//! Database module for SQLite operations

mod accounts;
mod connection;
mod migrations;
mod models;

pub use accounts::{
    delete_account, get_account_by_id, get_active_accounts, get_all_accounts,
    get_current_account, save_account, set_current_account, toggle_account_active,
};
pub use connection::{get_default_db_path, Database};
pub use migrations::run_migrations;
pub use models::{Account, AppConfig, MonitorLog, ProxyConfig, QuotaInfo};
