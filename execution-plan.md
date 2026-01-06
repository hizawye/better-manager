# Better Manager - Execution Plan

> Building a lighter, faster, more stable AI account manager and protocol proxy

## Project Summary

**Goal**: Recreate Antigravity Manager as a **web-based dashboard** with:
- Full feature parity (OAuth, multi-account, all 3 protocols, monitoring)
- React + TypeScript frontend (familiar ecosystem)
- Multi-platform distribution (macOS, Linux, Windows)
- Target size: ~15-20MB binary (vs ~150MB current)
- Default port: **8094**

---

## Step-by-Step Implementation

Each step is designed to be a single commit. Stop after each step to review and commit.

---

## PHASE 1: Project Foundation

### Step 1.1: Initialize Rust Project
**Commit message**: `feat: initialize rust project with cargo`

- [x] Run `cargo init --name better-manager`
- [ ] Update Cargo.toml with project metadata
- [ ] Create .gitignore
- [ ] Create README.md

**Files to create/modify**:
- `Cargo.toml`
- `.gitignore`
- `README.md`

---

### Step 1.2: Add Core Dependencies
**Commit message**: `feat: add core rust dependencies`

Add to Cargo.toml:
- axum (web framework)
- tokio (async runtime - minimal features)
- serde + serde_json (serialization)
- tracing + tracing-subscriber (logging)

**Files to modify**:
- `Cargo.toml`

---

### Step 1.3: Create Basic Axum Server
**Commit message**: `feat: create basic axum server with health endpoint`

- [ ] Create `src/main.rs` with basic server
- [ ] Add `/health` endpoint
- [ ] Server listens on port 8094
- [ ] Basic console logging

**Files to create/modify**:
- `src/main.rs`

**Test**: `cargo run` → visit `http://localhost:8094/health`

---

### Step 1.4: Add Project Structure (Empty Modules)
**Commit message**: `feat: create project module structure`

Create empty module files:
```
src/
├── main.rs
├── lib.rs
├── config/
│   └── mod.rs
├── db/
│   └── mod.rs
├── auth/
│   └── mod.rs
├── api/
│   └── mod.rs
├── proxy/
│   └── mod.rs
└── utils/
    └── mod.rs
```

**Files to create**:
- `src/lib.rs`
- `src/config/mod.rs`
- `src/db/mod.rs`
- `src/auth/mod.rs`
- `src/api/mod.rs`
- `src/proxy/mod.rs`
- `src/utils/mod.rs`

---

### Step 1.5: Add CLI with Clap
**Commit message**: `feat: add CLI argument parsing with clap`

- [ ] Add clap dependency
- [ ] Create CLI struct with options:
  - `--port` (default: 8094)
  - `--config` (optional config file path)
  - `--host` (default: 127.0.0.1)
- [ ] Parse args in main.rs

**Files to modify**:
- `Cargo.toml`
- `src/main.rs`

**Test**: `cargo run -- --help`

---

### Step 1.6: Add Configuration Module
**Commit message**: `feat: add configuration settings module`

- [ ] Create `src/config/settings.rs`
- [ ] Define `Settings` struct (port, host, db_path, etc.)
- [ ] Add defaults
- [ ] Load from CLI args

**Files to create/modify**:
- `src/config/mod.rs`
- `src/config/settings.rs`

---

### Step 1.7: Add Structured Logging
**Commit message**: `feat: add structured logging with tracing`

- [ ] Initialize tracing subscriber in main
- [ ] Add log levels (info, debug, error)
- [ ] Log server startup

**Files to modify**:
- `src/main.rs`

**Test**: Run and see formatted logs

---

## PHASE 2: Database Layer

### Step 2.1: Add SQLite Dependencies
**Commit message**: `feat: add rusqlite dependency`

- [ ] Add rusqlite with bundled feature
- [ ] Add directories crate for data paths

**Files to modify**:
- `Cargo.toml`

---

### Step 2.2: Create Database Connection
**Commit message**: `feat: create database connection module`

- [ ] Create `src/db/connection.rs`
- [ ] Function to get DB path (platform-specific)
- [ ] Function to open/create database
- [ ] Initialize connection on startup

**Files to create/modify**:
- `src/db/mod.rs`
- `src/db/connection.rs`

---

### Step 2.3: Create Database Models
**Commit message**: `feat: define database models`

- [ ] Create `src/db/models.rs`
- [ ] Define `Account` struct
- [ ] Define `ProxyConfig` struct
- [ ] Define `MonitorLog` struct

**Files to create**:
- `src/db/models.rs`

---

### Step 2.4: Create Database Migrations
**Commit message**: `feat: add database migrations system`

- [ ] Create `src/db/migrations.rs`
- [ ] Create accounts table
- [ ] Create current_account table
- [ ] Create quota_info table
- [ ] Create app_config table
- [ ] Create proxy_config table
- [ ] Create proxy_monitor_logs table
- [ ] Run migrations on startup

**Files to create/modify**:
- `src/db/migrations.rs`
- `src/db/mod.rs`

**Test**: Run app, check DB file is created with tables

---

### Step 2.5: Add Account CRUD Operations
**Commit message**: `feat: add account database operations`

- [ ] Create `src/db/accounts.rs`
- [ ] `get_all_accounts()`
- [ ] `get_account_by_id()`
- [ ] `get_current_account()`
- [ ] `save_account()`
- [ ] `delete_account()`
- [ ] `switch_account()`

**Files to create**:
- `src/db/accounts.rs`

---

### Step 2.6: Add Config CRUD Operations
**Commit message**: `feat: add config database operations`

- [ ] Create `src/db/config.rs`
- [ ] `get_app_config()`
- [ ] `save_app_config()`
- [ ] `get_proxy_config()`
- [ ] `save_proxy_config()`

**Files to create**:
- `src/db/config.rs`

---

## PHASE 3: REST API

### Step 3.1: Create API Router Structure
**Commit message**: `feat: create api router structure`

- [ ] Create `src/api/routes.rs`
- [ ] Define API router with `/api` prefix
- [ ] Mount on main app

**Files to create/modify**:
- `src/api/mod.rs`
- `src/api/routes.rs`
- `src/main.rs`

---

### Step 3.2: Add Account API Endpoints
**Commit message**: `feat: add account api endpoints`

- [ ] Create `src/api/accounts.rs`
- [ ] `GET /api/accounts` - list all
- [ ] `GET /api/accounts/:id` - get one
- [ ] `DELETE /api/accounts/:id` - delete
- [ ] `PUT /api/accounts/:id` - update (toggle, reorder)
- [ ] `GET /api/accounts/current` - get current

**Files to create**:
- `src/api/accounts.rs`

**Test**: `curl http://localhost:8094/api/accounts`

---

### Step 3.3: Add Config API Endpoints
**Commit message**: `feat: add config api endpoints`

- [ ] Create `src/api/config.rs`
- [ ] `GET /api/config` - get app config
- [ ] `PUT /api/config` - update config
- [ ] `GET /api/proxy-config` - get proxy config
- [ ] `PUT /api/proxy-config` - update proxy config

**Files to create**:
- `src/api/config.rs`

---

### Step 3.4: Add Monitor API Endpoints
**Commit message**: `feat: add monitor api endpoints`

- [ ] Create `src/api/monitor.rs`
- [ ] `GET /api/logs` - get recent logs
- [ ] `GET /api/stats` - get statistics
- [ ] `DELETE /api/logs` - clear logs

**Files to create**:
- `src/api/monitor.rs`

---

## PHASE 4: OAuth Authentication

### Step 4.1: Add OAuth Dependencies
**Commit message**: `feat: add oauth dependencies`

- [ ] Add reqwest (HTTP client)
- [ ] Add url crate
- [ ] Add base64 crate

**Files to modify**:
- `Cargo.toml`

---

### Step 4.2: Create OAuth Module Structure
**Commit message**: `feat: create oauth module structure`

- [ ] Create `src/auth/google.rs`
- [ ] Define OAuth constants (client_id, scopes)
- [ ] Create `generate_auth_url()` function

**Files to create/modify**:
- `src/auth/mod.rs`
- `src/auth/google.rs`

---

### Step 4.3: Create OAuth Callback Server
**Commit message**: `feat: create oauth callback server`

- [ ] Create `src/auth/callback_server.rs`
- [ ] Temporary HTTP server for OAuth callback
- [ ] Parse authorization code from callback
- [ ] Return code via channel

**Files to create**:
- `src/auth/callback_server.rs`

---

### Step 4.4: Implement Token Exchange
**Commit message**: `feat: implement oauth token exchange`

- [ ] Add `exchange_code_for_tokens()` in google.rs
- [ ] Parse access_token and refresh_token
- [ ] Store tokens in database

**Files to modify**:
- `src/auth/google.rs`

---

### Step 4.5: Implement Token Refresh
**Commit message**: `feat: implement token refresh`

- [ ] Add `refresh_access_token()` function
- [ ] Update stored tokens
- [ ] Handle refresh failures

**Files to modify**:
- `src/auth/google.rs`

---

### Step 4.6: Add OAuth API Endpoint
**Commit message**: `feat: add oauth flow api endpoint`

- [ ] `POST /api/auth/start` - start OAuth flow
- [ ] Returns auth URL to frontend
- [ ] Waits for callback, saves account

**Files to modify**:
- `src/api/accounts.rs`

**Test**: Call endpoint, complete OAuth in browser

---

### Step 4.7: Add Quota Checking
**Commit message**: `feat: add quota checking`

- [ ] Create `src/auth/quota.rs`
- [ ] Call Google API to get model limits
- [ ] Parse quota info
- [ ] Store in database

**Files to create**:
- `src/auth/quota.rs`

---

## PHASE 5: Protocol Proxy

### Step 5.1: Create Proxy Server Structure
**Commit message**: `feat: create proxy server structure`

- [ ] Create `src/proxy/server.rs`
- [ ] Separate router for proxy routes
- [ ] Mount at root (not /api)

**Files to create/modify**:
- `src/proxy/mod.rs`
- `src/proxy/server.rs`

---

### Step 5.2: Create Token Manager
**Commit message**: `feat: create token manager for account pool`

- [ ] Create `src/proxy/token_manager.rs`
- [ ] Load accounts from database
- [ ] Filter available accounts
- [ ] Implement scheduling modes

**Files to create**:
- `src/proxy/token_manager.rs`

---

### Step 5.3: Create Session Manager
**Commit message**: `feat: create session manager for stickiness`

- [ ] Create `src/proxy/session_manager.rs`
- [ ] Track session → account mapping
- [ ] Implement sticky window (60s default)
- [ ] Clean up expired sessions

**Files to create**:
- `src/proxy/session_manager.rs`

---

### Step 5.4: Create Rate Limiter
**Commit message**: `feat: create rate limit tracker`

- [ ] Create `src/proxy/rate_limiter.rs`
- [ ] Track rate-limited accounts
- [ ] Parse retry-after headers
- [ ] Auto-clear expired limits

**Files to create**:
- `src/proxy/rate_limiter.rs`

---

### Step 5.5: Create CORS Middleware
**Commit message**: `feat: add cors middleware`

- [ ] Create `src/proxy/middleware/cors.rs`
- [ ] Allow all origins (configurable)
- [ ] Handle preflight requests

**Files to create**:
- `src/proxy/middleware/mod.rs`
- `src/proxy/middleware/cors.rs`

---

### Step 5.6: Create Auth Middleware
**Commit message**: `feat: add api key auth middleware`

- [ ] Create `src/proxy/middleware/auth.rs`
- [ ] Check Authorization header
- [ ] Verify API key (if configured)
- [ ] Skip if auth disabled

**Files to create**:
- `src/proxy/middleware/auth.rs`

---

### Step 5.7: Create Monitor Middleware
**Commit message**: `feat: add request monitor middleware`

- [ ] Create `src/proxy/middleware/monitor.rs`
- [ ] Log request method, path, status
- [ ] Track latency
- [ ] Store in database

**Files to create**:
- `src/proxy/middleware/monitor.rs`

---

### Step 5.8: Create OpenAI Protocol Handler
**Commit message**: `feat: add openai protocol handler`

- [ ] Create `src/proxy/handlers/mod.rs`
- [ ] Create `src/proxy/handlers/openai.rs`
- [ ] `GET /v1/models` - list models
- [ ] `POST /v1/chat/completions` - chat

**Files to create**:
- `src/proxy/handlers/mod.rs`
- `src/proxy/handlers/openai.rs`

---

### Step 5.9: Create Claude Protocol Handler
**Commit message**: `feat: add claude protocol handler`

- [ ] Create `src/proxy/handlers/claude.rs`
- [ ] `POST /v1/messages` - messages API
- [ ] `GET /v1/models/claude` - list models

**Files to create**:
- `src/proxy/handlers/claude.rs`

---

### Step 5.10: Create Gemini Protocol Handler
**Commit message**: `feat: add gemini protocol handler`

- [ ] Create `src/proxy/handlers/gemini.rs`
- [ ] `GET /v1beta/models` - list models
- [ ] `POST /v1beta/models/:model` - generate

**Files to create**:
- `src/proxy/handlers/gemini.rs`

---

### Step 5.11: Create OpenAI→Gemini Mapper
**Commit message**: `feat: add openai to gemini request mapper`

- [ ] Create `src/proxy/mappers/mod.rs`
- [ ] Create `src/proxy/mappers/openai_to_gemini.rs`
- [ ] Map messages format
- [ ] Map model names
- [ ] Map parameters

**Files to create**:
- `src/proxy/mappers/mod.rs`
- `src/proxy/mappers/openai_to_gemini.rs`

---

### Step 5.12: Create Claude→Gemini Mapper
**Commit message**: `feat: add claude to gemini request mapper`

- [ ] Create `src/proxy/mappers/claude_to_gemini.rs`
- [ ] Map content blocks
- [ ] Handle thinking mode
- [ ] Enforce role alternation

**Files to create**:
- `src/proxy/mappers/claude_to_gemini.rs`

---

### Step 5.13: Create Response Mappers
**Commit message**: `feat: add response mappers`

- [ ] Create `src/proxy/mappers/response.rs`
- [ ] Gemini → OpenAI response
- [ ] Gemini → Claude response
- [ ] Handle streaming (SSE)

**Files to create**:
- `src/proxy/mappers/response.rs`

---

### Step 5.14: Add Smart Routing
**Commit message**: `feat: add smart routing for background tasks`

- [ ] Create `src/proxy/routing.rs`
- [ ] Detect background tasks (title generation)
- [ ] Route to cheaper models
- [ ] Detect image requests

**Files to create**:
- `src/proxy/routing.rs`

---

### Step 5.15: Wire Up Complete Proxy
**Commit message**: `feat: wire up complete proxy server`

- [ ] Connect all handlers
- [ ] Apply middleware stack
- [ ] Add to main router

**Files to modify**:
- `src/proxy/server.rs`
- `src/main.rs`

**Test**: `curl -X POST http://localhost:8094/v1/messages ...`

---

## PHASE 6: Frontend

### Step 6.1: Initialize React Project
**Commit message**: `feat: initialize react frontend with vite`

- [ ] Create frontend directory
- [ ] Run `npm create vite@latest . -- --template react-ts`
- [ ] Install dependencies

**Files to create**:
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/tsconfig.json`
- `frontend/index.html`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`

---

### Step 6.2: Add TailwindCSS + DaisyUI
**Commit message**: `feat: add tailwindcss and daisyui`

- [ ] Install tailwindcss, postcss, autoprefixer
- [ ] Install daisyui
- [ ] Create tailwind.config.js
- [ ] Add to CSS

**Files to create/modify**:
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/src/index.css`

---

### Step 6.3: Add Routing with Wouter
**Commit message**: `feat: add routing with wouter`

- [ ] Install wouter
- [ ] Set up routes in App.tsx
- [ ] Create placeholder pages

**Files to modify**:
- `frontend/package.json`
- `frontend/src/App.tsx`

---

### Step 6.4: Create Layout Components
**Commit message**: `feat: create layout components`

- [ ] Create `frontend/src/components/layout/Layout.tsx`
- [ ] Create `frontend/src/components/layout/Sidebar.tsx`
- [ ] Create `frontend/src/components/layout/Header.tsx`

**Files to create**:
- `frontend/src/components/layout/Layout.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/Header.tsx`

---

### Step 6.5: Create API Client
**Commit message**: `feat: create api client`

- [ ] Create `frontend/src/api/client.ts`
- [ ] Wrapper around fetch
- [ ] Error handling
- [ ] Base URL configuration

**Files to create**:
- `frontend/src/api/client.ts`

---

### Step 6.6: Create Zustand Stores
**Commit message**: `feat: create zustand stores`

- [ ] Install zustand
- [ ] Create `frontend/src/stores/accountStore.ts`
- [ ] Create `frontend/src/stores/configStore.ts`
- [ ] Create `frontend/src/stores/proxyStore.ts`

**Files to create**:
- `frontend/src/stores/accountStore.ts`
- `frontend/src/stores/configStore.ts`
- `frontend/src/stores/proxyStore.ts`

---

### Step 6.7: Create Dashboard Page
**Commit message**: `feat: create dashboard page`

- [ ] Create `frontend/src/pages/Dashboard.tsx`
- [ ] Show account overview
- [ ] Show quota summary
- [ ] Show proxy status

**Files to create**:
- `frontend/src/pages/Dashboard.tsx`

---

### Step 6.8: Create Accounts Page
**Commit message**: `feat: create accounts page`

- [ ] Create `frontend/src/pages/Accounts.tsx`
- [ ] List accounts
- [ ] Add account button (OAuth)
- [ ] Delete account
- [ ] Show quota per account

**Files to create**:
- `frontend/src/pages/Accounts.tsx`

---

### Step 6.9: Create Proxy Page
**Commit message**: `feat: create proxy control page`

- [ ] Create `frontend/src/pages/Proxy.tsx`
- [ ] Server status and control
- [ ] Endpoint URLs display
- [ ] Model mapping editor
- [ ] Keep under 300 lines!

**Files to create**:
- `frontend/src/pages/Proxy.tsx`

---

### Step 6.10: Create Monitor Page
**Commit message**: `feat: create monitor page`

- [ ] Create `frontend/src/pages/Monitor.tsx`
- [ ] Request logs table
- [ ] Filter by status/model
- [ ] Clear logs button

**Files to create**:
- `frontend/src/pages/Monitor.tsx`

---

### Step 6.11: Create Settings Page
**Commit message**: `feat: create settings page`

- [ ] Create `frontend/src/pages/Settings.tsx`
- [ ] Language selector
- [ ] Theme selector
- [ ] Security settings

**Files to create**:
- `frontend/src/pages/Settings.tsx`

---

### Step 6.12: Create Common Components
**Commit message**: `feat: create common ui components`

- [ ] Create `frontend/src/components/common/Button.tsx`
- [ ] Create `frontend/src/components/common/Card.tsx`
- [ ] Create `frontend/src/components/common/Badge.tsx`
- [ ] Create `frontend/src/components/common/Modal.tsx`

**Files to create**:
- `frontend/src/components/common/Button.tsx`
- `frontend/src/components/common/Card.tsx`
- `frontend/src/components/common/Badge.tsx`
- `frontend/src/components/common/Modal.tsx`

---

### Step 6.13: Create Account Components
**Commit message**: `feat: create account components`

- [ ] Create `frontend/src/components/account/AccountCard.tsx`
- [ ] Create `frontend/src/components/account/OAuthButton.tsx`
- [ ] Create `frontend/src/components/account/QuotaBar.tsx`

**Files to create**:
- `frontend/src/components/account/AccountCard.tsx`
- `frontend/src/components/account/OAuthButton.tsx`
- `frontend/src/components/account/QuotaBar.tsx`

---

## PHASE 7: Integration

### Step 7.1: Add rust-embed Dependency
**Commit message**: `feat: add rust-embed for static files`

- [ ] Add rust-embed to Cargo.toml
- [ ] Configure to embed frontend/dist

**Files to modify**:
- `Cargo.toml`

---

### Step 7.2: Build Frontend for Embedding
**Commit message**: `feat: add frontend build script`

- [ ] Create `scripts/build-frontend.sh`
- [ ] Run `npm run build` in frontend
- [ ] Output to frontend/dist

**Files to create**:
- `scripts/build-frontend.sh`

---

### Step 7.3: Serve Embedded Static Files
**Commit message**: `feat: serve embedded static files`

- [ ] Create static file handler
- [ ] Serve index.html for SPA routes
- [ ] Proper MIME types

**Files to modify**:
- `src/main.rs`

**Test**: Build frontend, run backend, visit http://localhost:8094

---

### Step 7.4: Add Auto-Open Browser
**Commit message**: `feat: add auto-open browser option`

- [ ] Add --open CLI flag
- [ ] Open default browser on start
- [ ] Cross-platform support

**Files to modify**:
- `src/main.rs`

---

### Step 7.5: Add Graceful Shutdown
**Commit message**: `feat: add graceful shutdown`

- [ ] Handle SIGTERM/SIGINT
- [ ] Finish in-flight requests
- [ ] Close database connection

**Files to modify**:
- `src/main.rs`

---

### Step 7.6: Add Configuration Hot-Reload
**Commit message**: `feat: add config hot-reload`

- [ ] Watch config changes via API
- [ ] Update proxy settings without restart
- [ ] Emit events to frontend

**Files to modify**:
- `src/proxy/server.rs`

---

## PHASE 8: Distribution

### Step 8.1: Add Release Profile Optimizations
**Commit message**: `feat: add release build optimizations`

- [ ] Add LTO, strip, opt-level to Cargo.toml
- [ ] Test release build size

**Files to modify**:
- `Cargo.toml`

---

### Step 8.2: Create Build Scripts
**Commit message**: `feat: add build scripts for all platforms`

- [ ] Create `scripts/build.sh`
- [ ] Build frontend
- [ ] Build release binary
- [ ] Package for distribution

**Files to create**:
- `scripts/build.sh`

---

### Step 8.3: Add GitHub Actions CI
**Commit message**: `feat: add github actions for ci/cd`

- [ ] Create `.github/workflows/build.yml`
- [ ] Build on push
- [ ] Test on all platforms
- [ ] Create release artifacts

**Files to create**:
- `.github/workflows/build.yml`

---

### Step 8.4: Create Release Packages
**Commit message**: `feat: add release packaging`

- [ ] macOS: create .tar.gz
- [ ] Linux: create .tar.gz and .deb
- [ ] Windows: create .zip

**Files to modify**:
- `scripts/build.sh`
- `.github/workflows/build.yml`

---

### Step 8.5: Write Installation Docs
**Commit message**: `docs: add installation and usage docs`

- [ ] Update README.md with installation
- [ ] Add usage examples
- [ ] Add configuration reference

**Files to modify**:
- `README.md`

---

## Success Criteria

- [ ] Binary under 20MB
- [ ] Memory under 100MB running
- [ ] All 3 protocols working (OpenAI, Claude, Gemini)
- [ ] OAuth flow functional
- [ ] Account rotation working
- [ ] Session stickiness working
- [ ] Rate limit handling working
- [ ] Streaming responses working
- [ ] Web dashboard functional
- [ ] Builds on macOS, Linux, Windows

---

## Quick Reference

**Default Port**: 8094

**Run Dev**:
```bash
cargo run
```

**Run with Options**:
```bash
cargo run -- --port 9000 --host 0.0.0.0
```

**Build Release**:
```bash
./scripts/build.sh
```

**Frontend Dev**:
```bash
cd frontend && npm run dev
```
