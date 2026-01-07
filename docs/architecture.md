# Architecture

## Overview

Better Manager is an API proxy that routes Claude/OpenAI requests through Google Cloud Code accounts. It provides account pooling, rate limiting, model mapping, and a web dashboard.

## System Components

```
┌─────────────────┐
│   Claude Code   │
│   (Client)      │
└────────┬────────┘
         │ POST /v1/messages or /v1/chat/completions
         ▼
┌─────────────────────────────────────────────────────┐
│              Better Manager Proxy                    │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Claude    │  │   OpenAI    │  │   Gemini    │  │
│  │   Handler   │  │   Handler   │  │   Handler   │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │         │
│         └────────┬───────┴────────────────┘         │
│                  ▼                                   │
│         ┌───────────────┐                           │
│         │ Model Router  │                           │
│         │ (3-layer res.)│                           │
│         └───────┬───────┘                           │
│                 │                                    │
│    ┌────────────┴────────────┐                      │
│    ▼                         ▼                      │
│ ┌──────────────┐    ┌────────────────┐              │
│ │Token Manager │    │  Anthropic     │              │
│ │(Account Pool)│    │  Provider      │              │
│ └──────┬───────┘    └────────────────┘              │
│        │                                             │
│        ▼                                             │
│ ┌──────────────┐                                    │
│ │   Upstream   │                                    │
│ │   Client     │                                    │
│ └──────┬───────┘                                    │
└────────┼────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐         ┌─────────────────┐
│ Cloud Code API  │         │ api.anthropic.  │
│ googleapis.com  │         │ com / z.ai      │
└─────────────────┘         └─────────────────┘
```

## Backend Structure

```
src/
├── index.ts              # Express app entry point
├── config/
│   └── settings.ts       # Configuration and model mappings
├── api/
│   ├── accounts.ts       # Account management API
│   ├── mappings.ts       # Custom model mappings API
│   ├── monitor.ts        # Request monitoring API
│   └── providers.ts      # Provider configuration API
├── auth/
│   ├── google.ts         # Google OAuth client
│   └── routes.ts         # OAuth callback routes
├── db/
│   ├── index.ts          # Drizzle ORM setup
│   └── schema.ts         # SQLite schema definitions
└── proxy/
    ├── index.ts          # Proxy router setup
    ├── handlers/
    │   ├── claude.ts     # Claude API handler (streaming)
    │   ├── openai.ts     # OpenAI API handler (streaming)
    │   └── gemini.ts     # Gemini native handler
    ├── mappers/
    │   ├── claude.ts     # Claude ↔ Gemini transformers
    │   └── openai.ts     # OpenAI ↔ Gemini transformers
    ├── routing/
    │   ├── model-router.ts     # Smart model routing
    │   └── background-detector.ts
    ├── providers/
    │   └── anthropic.ts  # Native Anthropic provider
    ├── token-manager.ts  # Account pool with rate limiting
    ├── upstream.ts       # Cloud Code API client
    ├── rate-limiter.ts   # Rate limit tracking
    ├── session-manager.ts
    └── types.ts          # TypeScript type definitions
```

## Frontend Structure

```
frontend/
├── vite.config.ts        # Vite configuration
├── src/
│   ├── main.tsx          # React entry point
│   ├── App.tsx           # Router and layout
│   ├── api/              # API clients
│   │   ├── client.ts     # Axios instance
│   │   ├── accounts.ts
│   │   ├── mappings.ts
│   │   └── types.ts
│   ├── components/
│   │   ├── common/       # Reusable components
│   │   └── layout/       # Layout components
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Accounts.tsx  # Account management + quota display
│   │   ├── Proxy.tsx     # Proxy config + model mappings
│   │   ├── Monitor.tsx
│   │   └── Providers.tsx
│   ├── stores/           # Zustand state stores
│   └── i18n/             # Internationalization
```

## Key Data Flows

### 1. Model Routing (3-layer resolution)

```
Request → Custom Mapping → Protocol Default → Built-in Fallback
           (database)      (claude/openai)     (hardcoded)
```

### 2. Account Pool Management

```
getToken() → Check Session Binding → Check Rate Limits → Round-robin Select
                     ↓                      ↓
              Cache-first wait       Mark as limited
                                    (parse retry-after)
```

### 3. Quota Fetching

```
GET /accounts → For each account → Check cache (1min TTL)
                                        ↓ (cache miss)
                                   loadCodeAssist API
                                        ↓
                                   Extract quotas
                                   (pro/flash/image)
```

## Database Schema (SQLite)

- **accounts**: Google accounts with OAuth tokens
- **current_account**: Currently selected account
- **quota_info**: Cached quota information
- **app_config**: Key-value configuration
- **proxy_config**: Proxy settings
- **proxy_monitor_logs**: Request logs

## Available Cloud Code Models

| Model | Use Case |
|-------|----------|
| `claude-opus-4-5-thinking` | High-capability thinking |
| `claude-sonnet-4-5-thinking` | Mid-tier thinking |
| `claude-sonnet-4-5` | Mid-tier non-thinking |
| `gemini-3-pro-high` | High quality/slow |
| `gemini-3-pro-low` | Lower quality/fast |
| `gemini-3-pro-image` | Image generation/vision |
