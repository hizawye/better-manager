# Database Guide - SQLite Schema

## Overview

Antigravity Tools uses **SQLite** for local data storage. The database stores:
- Account credentials
- Application configuration
- Proxy settings
- Request monitoring logs

**Database Location**:
- **macOS**: `~/Library/Application Support/com.antigravity.tools/state.vscdb`
- **Linux**: `~/.local/share/antigravity-tools/state.vscdb`
- **Windows**: `%APPDATA%\antigravity-tools\state.vscdb`

## Schema Overview

```sql
-- Accounts table
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    project_id TEXT,
    subscription_tier TEXT,
    is_forbidden INTEGER DEFAULT 0,
    disabled_for_proxy INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Current account tracking
CREATE TABLE current_account (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    email TEXT NOT NULL
);

-- Quota information
CREATE TABLE quota_info (
    account_id INTEGER PRIMARY KEY,
    pro_quota REAL DEFAULT 0,
    flash_quota REAL DEFAULT 0,
    image_quota REAL DEFAULT 0,
    next_reset_time INTEGER,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Application configuration
CREATE TABLE app_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    language TEXT DEFAULT 'en',
    theme TEXT DEFAULT 'light',
    auto_start INTEGER DEFAULT 0,
    page_size INTEGER DEFAULT 20
);

-- Proxy configuration
CREATE TABLE proxy_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    port INTEGER DEFAULT 8045,
    allow_lan_access INTEGER DEFAULT 0,
    require_auth INTEGER DEFAULT 0,
    api_key TEXT,
    scheduling_mode TEXT DEFAULT 'balanced',
    anthropic_mapping TEXT DEFAULT '{}',
    openai_mapping TEXT DEFAULT '{}',
    custom_mapping TEXT DEFAULT '{}'
);

-- Request monitoring logs
CREATE TABLE proxy_monitor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    status INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    account_email TEXT,
    model TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    error_message TEXT
);

-- Indexes
CREATE INDEX idx_accounts_email ON accounts(email);
CREATE INDEX idx_quota_account ON quota_info(account_id);
CREATE INDEX idx_logs_timestamp ON proxy_monitor_logs(timestamp DESC);
```

## Data Models (Rust)

### Account Model

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: Option<i64>,
    pub email: String,
    pub access_token: String,
    pub refresh_token: String,
    pub project_id: Option<String>,
    pub subscription_tier: Option<String>,
    pub is_forbidden: bool,
    pub disabled_for_proxy: bool,
    pub display_order: i64,
    pub quota_info: Option<QuotaInfo>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuotaInfo {
    pub pro_quota: f64,
    pub flash_quota: f64,
    pub image_quota: f64,
    pub next_reset_time: Option<i64>,
    pub updated_at: i64,
}
```

## Database Operations

### Initialization (`modules/db.rs`)

```rust
pub fn init_database() -> Result<Connection> {
    let db_path = get_db_path();
    
    // Ensure directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    
    let conn = Connection::open(&db_path)?;
    
    // Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    
    Ok(conn)
}

pub fn get_db_path() -> PathBuf {
    if let Ok(custom_path) = std::env::var("ANTIGRAVITY_USER_DATA_DIR") {
        return PathBuf::from(custom_path).join("state.vscdb");
    }
    
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir()
            .unwrap()
            .join("Library/Application Support/com.antigravity.tools/state.vscdb")
    }
    
    #[cfg(target_os = "linux")]
    {
        dirs::data_local_dir()
            .unwrap()
            .join("antigravity-tools/state.vscdb")
    }
    
    #[cfg(target_os = "windows")]
    {
        dirs::data_dir()
            .unwrap()
            .join("antigravity-tools/state.vscdb")
    }
}
```

### Account CRUD Operations (`modules/account.rs`)

```rust
// Get all accounts
pub fn get_all_accounts(conn: &Connection) -> Result<Vec<Account>> {
    let mut stmt = conn.prepare("
        SELECT a.*, 
               q.pro_quota, q.flash_quota, q.image_quota, 
               q.next_reset_time
        FROM accounts a
        LEFT JOIN quota_info q ON a.id = q.account_id
        ORDER BY a.display_order, a.id
    ")?;
    
    let accounts = stmt.query_map([], |row| {
        Ok(Account {
            id: Some(row.get(0)?),
            email: row.get(1)?,
            access_token: row.get(2)?,
            refresh_token: row.get(3)?,
            project_id: row.get(4)?,
            subscription_tier: row.get(5)?,
            is_forbidden: row.get::<_, i32>(6)? != 0,
            disabled_for_proxy: row.get::<_, i32>(7)? != 0,
            display_order: row.get(8)?,
            quota_info: Some(QuotaInfo {
                pro_quota: row.get(9).unwrap_or(0.0),
                flash_quota: row.get(10).unwrap_or(0.0),
                image_quota: row.get(11).unwrap_or(0.0),
                next_reset_time: row.get(12).ok(),
                updated_at: 0,
            }),
            created_at: row.get(13)?,
            updated_at: row.get(14)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;
    
    Ok(accounts)
}

// Save account
pub fn save_account(conn: &Connection, account: &Account) -> Result<i64> {
    let now = chrono::Utc::now().timestamp();
    
    if let Some(id) = account.id {
        // Update existing
        conn.execute(
            "UPDATE accounts SET 
                access_token = ?1,
                refresh_token = ?2,
                project_id = ?3,
                subscription_tier = ?4,
                is_forbidden = ?5,
                disabled_for_proxy = ?6,
                display_order = ?7,
                updated_at = ?8
             WHERE id = ?9",
            params![
                &account.access_token,
                &account.refresh_token,
                &account.project_id,
                &account.subscription_tier,
                account.is_forbidden as i32,
                account.disabled_for_proxy as i32,
                account.display_order,
                now,
                id,
            ],
        )?;
        
        // Update quota if present
        if let Some(quota) = &account.quota_info {
            save_quota_info(conn, id, quota)?;
        }
        
        Ok(id)
    } else {
        // Insert new
        conn.execute(
            "INSERT INTO accounts (
                email, access_token, refresh_token, 
                project_id, subscription_tier,
                is_forbidden, disabled_for_proxy,
                display_order, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                &account.email,
                &account.access_token,
                &account.refresh_token,
                &account.project_id,
                &account.subscription_tier,
                account.is_forbidden as i32,
                account.disabled_for_proxy as i32,
                account.display_order,
                now,
                now,
            ],
        )?;
        
        Ok(conn.last_insert_rowid())
    }
}

// Delete account
pub fn delete_account(conn: &Connection, id: i64) -> Result<()> {
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
    Ok(())
}
```

### Configuration Operations

```rust
pub fn get_app_config(conn: &Connection) -> Result<AppConfig> {
    let mut stmt = conn.prepare(
        "SELECT language, theme, auto_start, page_size 
         FROM app_config WHERE id = 1"
    )?;
    
    let config = stmt.query_row([], |row| {
        Ok(AppConfig {
            language: row.get(0)?,
            theme: row.get(1)?,
            auto_start: row.get::<_, i32>(2)? != 0,
            page_size: row.get(3)?,
        })
    })?;
    
    Ok(config)
}

pub fn save_app_config(conn: &Connection, config: &AppConfig) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO app_config (id, language, theme, auto_start, page_size)
         VALUES (1, ?1, ?2, ?3, ?4)",
        params![
            &config.language,
            &config.theme,
            config.auto_start as i32,
            config.page_size,
        ],
    )?;
    Ok(())
}
```

## Migrations (`modules/migration.rs`)

```rust
pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Create version table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        )",
        [],
    )?;
    
    let current_version = get_schema_version(conn)?;
    
    if current_version < 1 {
        migrate_v1(conn)?;
        set_schema_version(conn, 1)?;
    }
    
    if current_version < 2 {
        migrate_v2(conn)?;
        set_schema_version(conn, 2)?;
    }
    
    if current_version < 3 {
        migrate_v3(conn)?;
        set_schema_version(conn, 3)?;
    }
    
    // ... more migrations
    
    Ok(())
}

fn migrate_v1(conn: &Connection) -> Result<()> {
    // Initial schema
    conn.execute_batch("
        CREATE TABLE accounts (...);
        CREATE TABLE current_account (...);
        CREATE TABLE quota_info (...);
        CREATE TABLE app_config (...);
        CREATE TABLE proxy_config (...);
    ")?;
    Ok(())
}

fn migrate_v2(conn: &Connection) -> Result<()> {
    // Add subscription_tier column
    conn.execute(
        "ALTER TABLE accounts ADD COLUMN subscription_tier TEXT",
        [],
    )?;
    Ok(())
}

fn migrate_v3(conn: &Connection) -> Result<()> {
    // Add disabled_for_proxy column
    conn.execute(
        "ALTER TABLE accounts ADD COLUMN disabled_for_proxy INTEGER DEFAULT 0",
        [],
    )?;
    Ok(())
}
```

## Monitoring Logs

### Log Storage

```rust
pub fn save_monitor_log(
    conn: &Connection,
    log: &MonitorLog,
) -> Result<()> {
    conn.execute(
        "INSERT INTO proxy_monitor_logs (
            timestamp, method, path, status, latency_ms,
            account_email, model, input_tokens, output_tokens,
            error_message
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            log.timestamp,
            &log.method,
            &log.path,
            log.status,
            log.latency_ms,
            &log.account_email,
            &log.model,
            log.input_tokens,
            log.output_tokens,
            &log.error_message,
        ],
    )?;
    Ok(())
}

pub fn get_recent_logs(
    conn: &Connection,
    limit: usize,
) -> Result<Vec<MonitorLog>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM proxy_monitor_logs 
         ORDER BY timestamp DESC 
         LIMIT ?1"
    )?;
    
    let logs = stmt.query_map([limit], |row| {
        Ok(MonitorLog {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            method: row.get(2)?,
            path: row.get(3)?,
            status: row.get(4)?,
            latency_ms: row.get(5)?,
            account_email: row.get(6)?,
            model: row.get(7)?,
            input_tokens: row.get(8)?,
            output_tokens: row.get(9)?,
            error_message: row.get(10)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;
    
    Ok(logs)
}
```

## Transaction Management

```rust
pub fn batch_update_accounts(
    conn: &mut Connection,
    updates: Vec<AccountUpdate>,
) -> Result<()> {
    let tx = conn.transaction()?;
    
    for update in updates {
        tx.execute(
            "UPDATE accounts SET ... WHERE id = ?",
            params![...],
        )?;
    }
    
    tx.commit()?;
    Ok(())
}
```

## Database Backup

```rust
pub fn backup_database(backup_path: &Path) -> Result<()> {
    let src = get_db_path();
    std::fs::copy(&src, backup_path)?;
    Ok(())
}

pub fn restore_database(backup_path: &Path) -> Result<()> {
    let dst = get_db_path();
    std::fs::copy(backup_path, &dst)?;
    Ok(())
}
```

## Query Performance

### Indexes

```sql
-- Speed up account lookups
CREATE INDEX idx_accounts_email ON accounts(email);

-- Speed up quota queries
CREATE INDEX idx_quota_account ON quota_info(account_id);

-- Speed up log queries
CREATE INDEX idx_logs_timestamp ON proxy_monitor_logs(timestamp DESC);
CREATE INDEX idx_logs_account ON proxy_monitor_logs(account_email);
```

### Query Optimization Tips

1. **Use prepared statements** for repeated queries
2. **Batch inserts** using transactions
3. **Limit result sets** with LIMIT clause
4. **Use indexes** for WHERE and ORDER BY columns
5. **Analyze query plans** with EXPLAIN QUERY PLAN

## Data Export/Import

### Export to JSON

```rust
pub fn export_accounts_to_json(conn: &Connection) -> Result<String> {
    let accounts = get_all_accounts(conn)?;
    let json = serde_json::to_string_pretty(&accounts)?;
    Ok(json)
}
```

### Import from JSON

```rust
pub fn import_accounts_from_json(
    conn: &mut Connection,
    json: &str,
) -> Result<usize> {
    let accounts: Vec<Account> = serde_json::from_str(json)?;
    
    let tx = conn.transaction()?;
    let mut count = 0;
    
    for account in accounts {
        save_account(&tx, &account)?;
        count += 1;
    }
    
    tx.commit()?;
    Ok(count)
}
```

## Security Considerations

1. **Encryption**: Consider encrypting sensitive fields (tokens)
2. **Permissions**: Set proper file permissions on database
3. **Backups**: Regular backups to prevent data loss
4. **Validation**: Validate data before inserting
5. **Sanitization**: Prevent SQL injection (use params)
