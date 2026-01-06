# Antigravity Tools - Project Overview

## What is Antigravity Tools?

**Antigravity Tools** is a professional AI account management and protocol reverse proxy system. It's a desktop application built with **Tauri v2** that allows users to:

1. **Manage multiple AI accounts** (Google/Anthropic) with OAuth2 authentication
2. **Convert protocols** - Transform web session tokens into standardized API interfaces
3. **Act as a local AI gateway** - Route requests between different AI providers (OpenAI, Claude, Gemini)
4. **Monitor and optimize** - Track API usage, manage quotas, and intelligently route traffic

## Core Value Proposition

Antigravity Tools solves the problem of **API access barriers** by:
- Converting Session tokens to API-compatible formats
- Providing a unified interface for multiple AI providers
- Intelligent account rotation and quota management
- Local privacy-first data storage (SQLite)

## Technology Stack

### Frontend (React + TypeScript)
- **Framework**: React 19.1.0 with TypeScript
- **Build Tool**: Vite 7.0.4
- **Routing**: React Router DOM v7
- **State Management**: Zustand 5.0.9
- **UI Framework**: TailwindCSS + DaisyUI
- **Internationalization**: i18next
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Charts**: Recharts

### Backend (Rust + Tauri)
- **Desktop Framework**: Tauri v2
- **Language**: Rust (Edition 2021)
- **Web Server**: Axum 0.7 (async HTTP framework)
- **Database**: SQLite (via rusqlite)
- **HTTP Client**: Reqwest 0.12
- **Async Runtime**: Tokio (full features)
- **Logging**: tracing + tracing-subscriber
- **Serialization**: serde + serde_json

### Key Dependencies
- **Authentication**: OAuth 2.0 flow with custom server
- **Data Storage**: Local SQLite database (encrypted)
- **Process Management**: sysinfo for system monitoring
- **Image Processing**: image crate for multi-modal support
- **Cross-platform**: Works on macOS, Windows, and Linux

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Desktop Application                       │
│                      (Tauri Window)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                ┌─────────────┴──────────────┐
                │                            │
        ┌───────▼────────┐          ┌───────▼────────┐
        │   Frontend      │          │   Backend      │
        │   (React/TS)    │◄────────►│   (Rust)       │
        │   Port: 1420    │   IPC    │   Tauri Core   │
        └─────────────────┘          └────────┬───────┘
                                              │
                    ┌─────────────────────────┼─────────────────────┐
                    │                         │                     │
            ┌───────▼────────┐    ┌──────────▼──────────┐  ┌──────▼──────┐
            │  Axum Server   │    │  Account Manager    │  │  Database   │
            │  (API Proxy)   │    │  (OAuth + Tokens)   │  │  (SQLite)   │
            │  Port: 8045    │    └─────────────────────┘  └─────────────┘
            └────────┬───────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼───┐  ┌───▼────┐  ┌──▼─────┐
    │ OpenAI │  │ Claude │  │ Gemini │
    │Protocol│  │Protocol│  │Protocol│
    └────────┘  └────────┘  └────────┘
         │           │           │
         └───────────┼───────────┘
                     │
              ┌──────▼────────┐
              │ Google/       │
              │ Anthropic API │
              └───────────────┘
```

## Project Structure

```
Antigravity-Manager/
├── src/                          # Frontend React application
│   ├── components/              # Reusable UI components
│   ├── pages/                   # Main application pages
│   ├── services/                # API service layer
│   ├── stores/                  # Zustand state management
│   ├── types/                   # TypeScript type definitions
│   ├── utils/                   # Utility functions
│   ├── App.tsx                  # Main React component
│   └── main.tsx                 # React entry point
│
├── src-tauri/                   # Backend Rust application
│   ├── src/
│   │   ├── commands/           # Tauri IPC commands
│   │   ├── models/             # Data models
│   │   ├── modules/            # Core business logic
│   │   │   ├── account.rs      # Account management
│   │   │   ├── oauth.rs        # OAuth flow
│   │   │   ├── quota.rs        # Quota checking
│   │   │   └── process.rs      # Process management
│   │   ├── proxy/              # API proxy server
│   │   │   ├── handlers/       # Request handlers
│   │   │   ├── mappers/        # Protocol converters
│   │   │   ├── middleware/     # Middleware layers
│   │   │   └── server.rs       # Axum server
│   │   └── utils/              # Utility functions
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
│
├── public/                      # Static assets
├── docs/                        # Documentation
├── scripts/                     # Build scripts
├── package.json                 # Node.js dependencies
├── vite.config.ts              # Vite configuration
└── tailwind.config.js          # Tailwind CSS config
```

## Key Features

### 1. Account Management
- OAuth 2.0 authentication
- Multi-account support
- Automatic token refresh
- Account quota monitoring
- Subscription tier detection (PRO/ULTRA/FREE)

### 2. API Proxy Server
- Runs on `localhost:8045`
- Supports 3 protocols: OpenAI, Claude (Anthropic), Gemini
- Automatic protocol translation
- Smart request routing
- Rate limit handling

### 3. Smart Routing
- Model mapping (route requests to different models)
- Account rotation (distribute load across accounts)
- Quota-aware routing
- Session stickiness (keep same account for conversations)

### 4. Multi-Modal Support
- Text generation
- Image recognition
- Image generation (Imagen 3)
- Tool/Function calling
- Streaming responses

### 5. Monitoring & Analytics
- Request logging
- Token usage tracking
- Performance metrics
- Error tracking
- Real-time dashboard

## Development Workflow

1. **Frontend Development**: `npm run dev` (Vite dev server on port 1420)
2. **Full App Development**: `npm run tauri dev` (Runs both frontend + Tauri)
3. **Production Build**: `npm run tauri build`
4. **Backend Only**: Modify `src-tauri/src/**/*.rs` files

## Data Flow Example

```
User Request (Claude CLI)
    │
    ▼
curl http://localhost:8045/v1/messages
    │
    ▼
Axum Server (server.rs)
    │
    ▼
Middleware (auth, CORS, monitor)
    │
    ▼
Handler (handlers/claude.rs)
    │
    ▼
Mapper (mappers/claude/request.rs)
    │
    ├─► Token Manager (get account)
    │
    └─► Protocol Conversion (Claude → Gemini)
        │
        ▼
    Upstream Request (Google API)
        │
        ▼
    Response Mapping (Gemini → Claude)
        │
        ▼
    Stream back to client
```

## Configuration Files

- **tauri.conf.json**: Tauri app configuration (window, permissions, build)
- **vite.config.ts**: Frontend build configuration
- **Cargo.toml**: Rust dependencies and project metadata
- **package.json**: Node.js dependencies and scripts
- **tailwind.config.js**: TailwindCSS theme and plugins

## Next Steps

To understand the project in depth, read these documents in order:

1. `02-ARCHITECTURE.md` - Deep dive into system architecture
2. `03-BACKEND-GUIDE.md` - How the Rust backend works
3. `04-ROUTING-SYSTEM.md` - Understanding request routing
4. `05-PROXY-SERVER.md` - How the proxy server works
5. `06-FRONTEND-GUIDE.md` - React application structure
6. `07-DATABASE.md` - Data storage and models
7. `08-DEPLOYMENT.md` - Building and distributing the app
