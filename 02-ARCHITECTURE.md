# System Architecture

## High-Level Architecture

Antigravity Tools follows a **Desktop Application + Embedded Web Server** architecture pattern:

```
┌────────────────────────────────────────────────────────────┐
│                    Tauri Application                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  WebView (React Frontend)                            │  │
│  │  - Dashboard, Account Manager, Settings UI          │  │
│  └─────────────┬────────────────────────────────────────┘  │
│                │ IPC (Inter-Process Communication)         │
│  ┌─────────────▼────────────────────────────────────────┐  │
│  │  Rust Backend (Tauri Core)                          │  │
│  │  ┌────────────┐  ┌──────────────┐  ┌─────────────┐ │  │
│  │  │  Commands  │  │   Modules    │  │  Database   │ │  │
│  │  │   Layer    │  │   (Business  │  │  (SQLite)   │ │  │
│  │  │            │  │    Logic)    │  │             │ │  │
│  │  └────────────┘  └──────────────┘  └─────────────┘ │  │
│  │                                                     │  │
│  │  ┌─────────────────────────────────────────────┐   │  │
│  │  │  Axum Proxy Server (Port 8045)             │   │  │
│  │  │  - Request Handlers                        │   │  │
│  │  │  - Protocol Mappers                        │   │  │
│  │  │  - Token Manager                           │   │  │
│  │  └─────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    External Clients
            (Claude CLI, Cursor, Cherry Studio, etc.)
```

## Three-Tier Architecture

### 1. Presentation Layer (Frontend - React)

**Location**: `src/`

**Responsibilities**:
- User interface rendering
- User input handling
- State management (Zustand)
- API calls to Tauri backend via IPC

**Key Components**:
```
src/
├── pages/              # Main screens
│   ├── Dashboard.tsx   # Overview & metrics
│   ├── Accounts.tsx    # Account management
│   ├── ApiProxy.tsx    # Proxy server control
│   ├── Monitor.tsx     # Request monitoring
│   └── Settings.tsx    # Configuration
├── components/         # Reusable UI components
├── stores/            # Zustand state stores
│   ├── useAccountStore.ts
│   ├── useConfigStore.ts
│   └── useProxyStore.ts
└── services/          # API service layer
```

**Communication**: Uses Tauri's `invoke()` API to call backend commands

### 2. Business Logic Layer (Backend - Rust)

**Location**: `src-tauri/src/`

**Responsibilities**:
- Account management (OAuth, token refresh)
- Database operations (SQLite)
- Process management
- Configuration management
- Quota checking

**Key Modules**:
```rust
src-tauri/src/
├── commands/           # Tauri IPC command handlers
│   ├── account.rs      # Account CRUD operations
│   ├── config.rs       # Configuration management
│   └── proxy.rs        # Proxy server control
├── modules/
│   ├── account.rs      # Account business logic
│   ├── oauth.rs        # OAuth 2.0 flow
│   ├── oauth_server.rs # Temporary OAuth callback server
│   ├── quota.rs        # Google API quota checking
│   ├── db.rs           # Database initialization
│   └── process.rs      # Process lifecycle management
└── models/             # Data structures
```

### 3. Proxy Layer (Axum Web Server)

**Location**: `src-tauri/src/proxy/`

**Responsibilities**:
- HTTP request/response handling
- Protocol translation (OpenAI ↔ Claude ↔ Gemini)
- Account selection & rotation
- Rate limiting & retry logic
- Request monitoring

**Architecture**:
```
proxy/
├── server.rs              # Axum server initialization
├── config.rs              # Proxy configuration
├── token_manager.rs       # Account pool management
├── session_manager.rs     # Session stickiness
├── rate_limit.rs          # Rate limit tracking
├── handlers/              # HTTP endpoint handlers
│   ├── openai.rs          # /v1/chat/completions, /v1/models, etc.
│   ├── claude.rs          # /v1/messages, /v1/models/claude
│   ├── gemini.rs          # /v1beta/models/:model
│   └── mcp.rs             # MCP tool endpoints
├── mappers/               # Protocol converters
│   ├── openai/            # OpenAI → Gemini mapping
│   ├── claude/            # Claude → Gemini mapping
│   └── gemini/            # Gemini native handling
├── middleware/            # Middleware layers
│   ├── auth.rs            # API key authentication
│   ├── cors.rs            # CORS headers
│   ├── monitor.rs         # Request logging
│   └── rate_limit.rs      # Rate limiting
└── upstream/              # Upstream API clients
    └── client.rs          # HTTP client with retry logic
```

## Component Interaction Flow

### Starting the Application

```
1. User launches app
   ↓
2. Tauri initializes (main.rs)
   ↓
3. Database migration runs (modules/migration.rs)
   ↓
4. Logger initializes (modules/logger.rs)
   ↓
5. System tray created (modules/tray.rs)
   ↓
6. React app loads (src/main.tsx)
   ↓
7. Config store loads settings (stores/useConfigStore.ts)
   ↓
8. Account store loads current account (stores/useAccountStore.ts)
   ↓
9. Dashboard displays
```

### Starting the Proxy Server

```
1. User clicks "Start Server" in ApiProxy page
   ↓
2. Frontend calls invoke('start_proxy_server')
   ↓
3. Backend (commands/proxy.rs) receives command
   ↓
4. Loads proxy config from database
   ↓
5. Creates TokenManager with available accounts
   ↓
6. Starts Axum server (server.rs)
   ├─ Binds to 127.0.0.1:8045 (or 0.0.0.0 if LAN enabled)
   ├─ Registers routes
   ├─ Applies middleware layers
   └─ Spawns async task
   ↓
7. Returns server status to frontend
   ↓
8. Frontend updates UI to show "Running"
```

### Handling an API Request

```
External Client (e.g., Claude CLI)
    │
    │ POST http://localhost:8045/v1/messages
    │
    ▼
┌───────────────────────────────────────────┐
│ Axum Server (server.rs)                   │
│   ├─ CORS middleware                      │
│   ├─ Auth middleware (check API key)      │
│   └─ Monitor middleware (log request)     │
└───────┬───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│ Handler (handlers/claude.rs)              │
│   └─ handle_messages()                    │
└───────┬───────────────────────────────────┘
        │
        ├─► Parse request body
        ├─► Extract session ID
        └─► Get model from request
            │
            ▼
┌───────────────────────────────────────────┐
│ Token Manager                             │
│   ├─ Check session stickiness             │
│   ├─ Get account from pool                │
│   └─ Return Account with token            │
└───────┬───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│ Mapper (mappers/claude/request.rs)        │
│   ├─ Convert Claude format → Gemini       │
│   ├─ Map model name                       │
│   ├─ Handle thinking mode                 │
│   └─ Build upstream request               │
└───────┬───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│ Upstream Client                           │
│   ├─ Add auth headers                     │
│   ├─ Send to Google API                   │
│   └─ Handle streaming response            │
└───────┬───────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│ Response Mapper (mappers/claude/response) │
│   ├─ Convert Gemini → Claude format       │
│   ├─ Extract thinking signature           │
│   ├─ Stream SSE events                    │
│   └─ Handle errors                        │
└───────┬───────────────────────────────────┘
        │
        ▼
    Client receives response
```

## Data Flow Architecture

### Account Data Flow

```
┌────────────┐         ┌─────────────┐        ┌──────────┐
│ OAuth Flow │────────►│   Account   │───────►│ Database │
│   (Web)    │         │   Module    │        │ (SQLite) │
└────────────┘         └─────────────┘        └──────────┘
                              │
                              │ Refresh Token
                              ▼
                       ┌──────────────┐
                       │ Google OAuth │
                       │     API      │
                       └──────────────┘
                              │
                              │ Access Token
                              ▼
                       ┌──────────────┐
                       │    Token     │
                       │   Manager    │
                       └──────────────┘
                              │
                              │ Used for requests
                              ▼
                       ┌──────────────┐
                       │   Upstream   │
                       │    Client    │
                       └──────────────┘
```

### Configuration Flow

```
┌──────────┐      ┌────────────┐      ┌──────────┐
│ Settings │─────►│   Config   │─────►│ Database │
│   Page   │      │   Store    │      │          │
└──────────┘      └────────────┘      └──────────┘
                        │
                        │ On Change
                        ▼
                  ┌────────────┐
                  │   Proxy    │
                  │   Server   │
                  │  Hot Reload│
                  └────────────┘
```

## State Management

### Frontend State (Zustand)

```typescript
// Account Store
{
  accounts: Account[],
  currentAccount: Account | null,
  fetchAccounts(),
  switchAccount(id),
  deleteAccount(id)
}

// Config Store
{
  config: Config,
  loadConfig(),
  updateConfig(partial)
}

// Proxy Store
{
  isRunning: boolean,
  logs: ProxyLog[],
  startServer(),
  stopServer(),
  updateConfig()
}
```

### Backend State (Arc + RwLock)

```rust
// AppState (Axum)
pub struct AppState {
    token_manager: Arc<TokenManager>,
    anthropic_mapping: Arc<RwLock<HashMap<String, String>>>,
    openai_mapping: Arc<RwLock<HashMap<String, String>>>,
    custom_mapping: Arc<RwLock<HashMap<String, String>>>,
    upstream_proxy: Arc<RwLock<UpstreamProxyConfig>>,
    monitor: Arc<ProxyMonitor>,
    // ... more state
}
```

## Concurrency Model

### Frontend
- Single-threaded (JavaScript event loop)
- Async operations via Promises
- State updates trigger re-renders

### Backend
- Multi-threaded (Tokio async runtime)
- Each API request handled in separate task
- Shared state protected by Arc + RwLock/Mutex
- Database connections pooled

## Security Architecture

### Data Security
- SQLite database stored locally
- No cloud sync by default
- OAuth tokens encrypted in database

### Network Security
- Proxy server binds to 127.0.0.1 by default
- Optional LAN access (0.0.0.0)
- API key authentication (optional)
- CORS headers configured

### Process Security
- Single instance enforcement
- Proper process cleanup on exit
- Error handling prevents crashes

## Scalability Considerations

### Account Pool
- Supports unlimited accounts
- Automatic rotation when rate limited
- Session stickiness for context preservation

### Request Handling
- Async I/O (non-blocking)
- Streaming responses reduce memory
- Connection pooling for efficiency

### Database
- SQLite sufficient for desktop use
- Indexes on frequently queried columns
- Migration system for schema updates

## Extension Points

1. **New Protocol Support**: Add handler in `handlers/`, mapper in `mappers/`
2. **Custom Middleware**: Add to `middleware/` and register in server.rs
3. **New Features**: Add Tauri commands in `commands/`, expose to frontend
4. **UI Pages**: Add new route in `App.tsx`, create page component
5. **Data Models**: Define in `models/`, update database migration
