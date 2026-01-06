# Backend Guide - Rust Implementation

## Overview

The backend is built with **Rust** and uses **Tauri v2** to create a native desktop application with web technologies. The backend handles:
1. Application lifecycle management
2. Database operations (SQLite)
3. OAuth authentication flow
4. Account & quota management
5. Embedded HTTP proxy server (Axum)

## Core Technologies

- **Tauri 2.0**: Desktop app framework
- **Axum 0.7**: Async HTTP web framework
- **Tokio**: Async runtime
- **Rusqlite**: SQLite database
- **Reqwest**: HTTP client
- **Tracing**: Structured logging

## Entry Points

### Main Entry: `src-tauri/src/main.rs`

```rust
// Minimal entry - delegates to lib.rs
fn main() {
    antigravity_tools_lib::run()
}
```

### Library Entry: `src-tauri/src/lib.rs`

```rust
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(...))
        .plugin(tauri_plugin_single_instance::init(...))
        .setup(|app| {
            // Initialize database
            // Run migrations
            // Setup logger
            // Create system tray
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Register all IPC commands
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## Module Structure

### 1. Commands (`commands/`)

Tauri IPC handlers that the frontend calls via `invoke()`.

**commands/account.rs**:
```rust
#[tauri::command]
pub async fn get_accounts() -> Result<Vec<Account>, String>

#[tauri::command]
pub async fn get_current_account() -> Result<Option<Account>, String>

#[tauri::command]
pub async fn switch_account(email: String) -> Result<(), String>

#[tauri::command]
pub async fn delete_account(id: i64) -> Result<(), String>

#[tauri::command]
pub async fn start_oauth_flow() -> Result<OAuthFlowData, String>

#[tauri::command]
pub async fn import_accounts_from_json(json_str: String) -> Result<usize, String>
```

**commands/proxy.rs**:
```rust
#[tauri::command]
pub async fn start_proxy_server(
    state: State<ProxyServerState>
) -> Result<ProxyStatus, String>

#[tauri::command]
pub async fn stop_proxy_server(
    state: State<ProxyServerState>
) -> Result<(), String>

#[tauri::command]
pub async fn get_proxy_status() -> Result<ProxyStatus, String>

#[tauri::command]
pub async fn update_proxy_config(
    config: ProxyConfig
) -> Result<(), String>
```

### 2. Modules (`modules/`)

Business logic implementation.

#### **modules/account.rs** - Account Management

```rust
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
}

// Core functions:
pub fn get_all_accounts(conn: &Connection) -> Result<Vec<Account>>
pub fn get_current_account(conn: &Connection) -> Result<Option<Account>>
pub fn switch_account(conn: &Connection, email: &str) -> Result<()>
pub fn save_account(conn: &Connection, account: &Account) -> Result<i64>
pub fn delete_account(conn: &Connection, id: i64) -> Result<()>
pub fn refresh_access_token(account: &mut Account) -> Result<()>
```

#### **modules/oauth.rs** - OAuth Flow

```rust
// OAuth constants
const OAUTH_CLIENT_ID: &str = "...";
const OAUTH_SCOPE: &str = "https://www.googleapis.com/auth/generative-language...";
const OAUTH_REDIRECT_URI: &str = "http://localhost:{PORT}/callback";

// Generate authorization URL
pub fn generate_auth_url(port: u16, state: &str) -> String

// Exchange authorization code for tokens
pub async fn exchange_code_for_tokens(
    code: &str, 
    redirect_uri: &str
) -> Result<TokenResponse>
```

#### **modules/oauth_server.rs** - OAuth Callback Server

```rust
pub async fn start_oauth_callback_server(
    port: u16,
    state_param: String,
    tx: oneshot::Sender<OAuthResult>,
) -> Result<()>

// Temporary HTTP server that:
// 1. Listens on random port
// 2. Waits for Google OAuth redirect
// 3. Extracts authorization code
// 4. Sends code back to main thread
// 5. Shuts down
```

#### **modules/quota.rs** - Quota Checking

```rust
pub async fn refresh_quota_for_account(
    account: &mut Account
) -> Result<QuotaInfo>

pub struct QuotaInfo {
    pub pro_quota: f64,
    pub flash_quota: f64,
    pub image_quota: f64,
    pub next_reset_time: Option<i64>,
}

// Calls Google API to fetch model limits:
// - gemini-2.0-pro
// - gemini-2.0-flash
// - imagen-3.0-generate-001
```

#### **modules/process.rs** - Process Management

```rust
pub fn is_process_running(exe_path: &str) -> bool

pub fn get_pid_by_path(exe_path: &str) -> Option<u32>

pub fn kill_process(pid: u32) -> Result<()>

pub fn restart_process(exe_path: &str, args: Vec<String>) -> Result<()>

// Uses `sysinfo` crate to:
// - Find processes by executable path
// - Send SIGTERM/SIGKILL signals
// - Monitor process lifecycle
```

#### **modules/db.rs** - Database

```rust
pub fn get_db_path() -> PathBuf

pub fn init_database() -> Result<Connection>

// Database location varies by OS:
// - macOS: ~/Library/Application Support/com.antigravity.tools/state.vscdb
// - Linux: ~/.local/share/antigravity-tools/state.vscdb
// - Windows: C:\Users\<user>\AppData\Roaming\antigravity-tools\state.vscdb
```

#### **modules/migration.rs** - Database Migrations

```rust
pub fn run_migrations(conn: &Connection) -> Result<()>

// Schema migrations:
// V1: Initial schema (accounts, config tables)
// V2: Add subscription_tier column
// V3: Add disabled_for_proxy column
// V4: Add display_order column
// V5: Add proxy_monitor_logs table
```

### 3. Models (`models/`)

Data structures shared across modules.

**models/account.rs**:
```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: Option<i64>,
    pub email: String,
    pub access_token: String,
    pub refresh_token: String,
    pub project_id: Option<String>,
    pub subscription_tier: Option<String>,
    pub quota_info: Option<QuotaInfo>,
    // ...
}
```

**models/config.rs**:
```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct AppConfig {
    pub language: String,
    pub theme: String,
    pub auto_start: bool,
    pub page_size: usize,
}
```

## Proxy Server Architecture

The proxy server is a separate Axum web server that runs inside the Tauri app.

### Server Initialization (`proxy/server.rs`)

```rust
pub struct AxumServer {
    shutdown_tx: Option<Sender<()>>,
    // Shared state references for hot-reloading
}

impl AxumServer {
    pub async fn start(
        host: String,
        port: u16,
        token_manager: Arc<TokenManager>,
        // ... config
    ) -> Result<(Self, JoinHandle<()>)> {
        
        // Build Axum app with routes
        let app = Router::new()
            // OpenAI routes
            .route("/v1/models", get(handlers::openai::handle_list_models))
            .route("/v1/chat/completions", post(handlers::openai::handle_chat_completions))
            
            // Claude routes
            .route("/v1/messages", post(handlers::claude::handle_messages))
            
            // Gemini routes
            .route("/v1beta/models/:model", post(handlers::gemini::handle_generate))
            
            // Middleware layers (applied bottom-to-top)
            .layer(DefaultBodyLimit::max(100 * 1024 * 1024)) // 100MB
            .layer(monitor_middleware)
            .layer(auth_middleware)
            .layer(cors_layer)
            .with_state(state);
        
        // Bind TCP listener
        let listener = TcpListener::bind(&addr).await?;
        
        // Spawn server task
        let handle = tokio::spawn(async move {
            // Accept connections in loop
        });
        
        Ok((server_instance, handle))
    }
    
    pub fn stop(self) {
        // Send shutdown signal
    }
}
```

### Token Manager (`proxy/token_manager.rs`)

Manages the pool of accounts and selects which account to use for each request.

```rust
pub struct TokenManager {
    accounts: Arc<RwLock<Vec<Account>>>,
    session_manager: Arc<SessionManager>,
    rate_limits: Arc<DashMap<String, RateLimitInfo>>,
    scheduling_mode: SchedulingMode,
}

pub enum SchedulingMode {
    CacheFirst,   // Prefer accounts with recent usage (caching)
    Balanced,      // Mix cached and fresh accounts
    Performance,   // Rotate evenly for max throughput
}

impl TokenManager {
    // Get account for a request
    pub async fn get_account_for_request(
        &self,
        session_id: &str,
        model: &str,
        request_type: RequestType,
    ) -> Result<Account> {
        // 1. Check session stickiness (60s window)
        if let Some(email) = self.session_manager.get_account(session_id) {
            if let Some(account) = self.find_account(&email).await {
                return Ok(account);
            }
        }
        
        // 2. Filter available accounts
        let accounts = self.accounts.read().await;
        let available: Vec<_> = accounts.iter()
            .filter(|a| !a.is_forbidden)
            .filter(|a| !a.disabled_for_proxy)
            .filter(|a| !self.is_rate_limited(&a.email))
            .collect();
        
        // 3. Apply scheduling mode
        let selected = match self.scheduling_mode {
            SchedulingMode::CacheFirst => {
                // Pick account with most recent usage
                self.select_by_recency(available)
            }
            SchedulingMode::Performance => {
                // Round-robin rotation
                self.select_round_robin(available)
            }
            _ => self.select_balanced(available)
        };
        
        // 4. Register session
        self.session_manager.register_session(session_id, &selected.email);
        
        Ok(selected)
    }
    
    // Mark account as rate-limited
    pub fn mark_rate_limited(
        &self,
        email: &str,
        reset_delay: Duration,
    ) {
        self.rate_limits.insert(email.to_string(), RateLimitInfo {
            until: Instant::now() + reset_delay,
        });
    }
}
```

### Request Flow Example

**OpenAI Chat Completions Handler** (`proxy/handlers/openai.rs`):

```rust
pub async fn handle_chat_completions(
    State(state): State<AppState>,
    Json(req): Json<OpenAIRequest>,
) -> Result<Response, (StatusCode, String)> {
    
    // 1. Generate session ID (hash of conversation)
    let session_id = generate_session_id(&req);
    
    // 2. Get account from token manager
    let account = state.token_manager
        .get_account_for_request(&session_id, &req.model, RequestType::Chat)
        .await?;
    
    // 3. Map request to upstream format
    let upstream_req = mappers::openai::map_request(
        &req,
        &account,
        &state.openai_mapping,
    ).await?;
    
    // 4. Send to upstream API
    let response = state.upstream
        .send_request(upstream_req, &account)
        .await?;
    
    // 5. Map response back to OpenAI format
    let openai_response = mappers::openai::map_response(response).await?;
    
    // 6. Stream or return complete response
    if req.stream {
        Ok(stream_sse_response(openai_response))
    } else {
        Ok(Json(openai_response).into_response())
    }
}
```

## Error Handling

### Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum ProxyError {
    #[error("Account not found: {0}")]
    AccountNotFound(String),
    
    #[error("All accounts rate limited")]
    AllAccountsRateLimited,
    
    #[error("Upstream API error: {0}")]
    UpstreamError(String),
    
    #[error("Protocol conversion error: {0}")]
    MappingError(String),
}
```

### Retry Logic

```rust
// Exponential backoff for server errors
pub async fn retry_with_backoff<F, T>(
    mut f: F,
    max_retries: usize,
) -> Result<T>
where
    F: FnMut() -> BoxFuture<'static, Result<T>>,
{
    let mut attempts = 0;
    loop {
        match f().await {
            Ok(val) => return Ok(val),
            Err(e) if should_retry(&e) && attempts < max_retries => {
                let delay = Duration::from_secs(2_u64.pow(attempts as u32));
                tokio::time::sleep(delay).await;
                attempts += 1;
            }
            Err(e) => return Err(e),
        }
    }
}
```

## Logging & Debugging

### Logger Setup (`modules/logger.rs`)

```rust
pub fn init_logger(log_path: &Path) -> Result<()> {
    let file_appender = tracing_appender::rolling::daily(
        log_path.parent().unwrap(),
        log_path.file_name().unwrap(),
    );
    
    tracing_subscriber::fmt()
        .with_max_level(Level::DEBUG)
        .with_writer(file_appender)
        .with_target(false)
        .init();
    
    Ok(())
}
```

### Log Locations

- **macOS**: `~/Library/Logs/com.antigravity.tools/app.log`
- **Linux**: `~/.local/share/antigravity-tools/logs/app.log`
- **Windows**: `C:\Users\<user>\AppData\Local\antigravity-tools\logs\app.log`

## Async Runtime

The app uses **Tokio** as the async runtime:

```rust
#[tokio::main]
async fn main() {
    // Tokio runtime configuration:
    // - Multi-threaded work-stealing scheduler
    // - Default thread count = CPU cores
    // - Async I/O for all network operations
}
```

## Concurrency Patterns

### Shared State

```rust
// Arc for shared ownership across threads
// RwLock for read-heavy, write-rare data
let accounts = Arc::new(RwLock::new(Vec::new()));

// Mutex for exclusive access
let counter = Arc::new(Mutex::new(0));

// DashMap for concurrent hash maps
let cache = Arc::new(DashMap::new());
```

### Channels

```rust
// Oneshot for single-value communication
let (tx, rx) = oneshot::channel();

// MPSC for multiple producers, single consumer
let (tx, mut rx) = mpsc::channel(100);
```

## Performance Optimizations

1. **Connection Pooling**: Reuse HTTP connections
2. **Async I/O**: Non-blocking operations
3. **Streaming**: Process data as it arrives (SSE)
4. **Caching**: Session stickiness reduces API calls
5. **Database Indexing**: Fast account lookups

## Security Considerations

1. **Token Storage**: Encrypted in SQLite
2. **Memory Safety**: Rust prevents buffer overflows, use-after-free
3. **Thread Safety**: Type system enforces safe concurrency
4. **Input Validation**: All IPC commands validate inputs
5. **Sandboxing**: Tauri restricts filesystem access
