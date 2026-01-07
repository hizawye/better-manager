# Better Manager

A lightweight AI account manager and multi-provider proxy for Gemini, Claude, OpenAI-compatible APIs.

## Features

- **Multi-Account Management**: OAuth-based Google account management with automatic rotation
- **Multi-Provider Support**: Native integration with Anthropic, Groq, Together AI, and more
- **Protocol Translation**: OpenAI, Claude, and Gemini API compatibility
- **Smart Routing**: Intelligent account rotation, session stickiness, and provider fallback
- **Rate Limit Handling**: Automatic account switching and provider failover
- **Streaming Support**: Full SSE streaming for all protocols and providers
- **Flexible Dispatch**: Exclusive, pooled, or fallback routing modes per provider
- **Web Dashboard**: Browser-based management interface (coming soon)
- **Lightweight**: TypeScript/Node.js implementation, easy to deploy

## Supported Providers

| Provider | Protocol | Features | Dispatch Modes |
|----------|----------|----------|----------------|
| **Gemini** | Google Cloud Code | Free tier, streaming, vision | Default backend |
| **Anthropic** | Native Claude API | All Claude models, streaming | exclusive, pooled, fallback |
| **Groq** | OpenAI-compatible | Ultra-fast inference | exclusive, pooled, fallback |
| **Together AI** | OpenAI-compatible | 100+ open models | exclusive, pooled, fallback |

See [docs/PROVIDERS.md](docs/PROVIDERS.md) for detailed configuration.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API keys
nano .env

# Start development server
npm run dev

# Or build and run
npm run build
npm start
```

## Configuration

See `.env.example` for all configuration options. Key settings:

```bash
# Server
PORT=8094
HOST=127.0.0.1

# Enable providers
ANTHROPIC_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DISPATCH_MODE=fallback

GROQ_ENABLED=true
GROQ_API_KEY=gsk_...
GROQ_DISPATCH_MODE=fallback
```

## Dispatch Modes

- **`off`**: Provider disabled
- **`exclusive`**: All requests go to this provider (no Gemini fallback)
- **`pooled`**: Distribute requests across all providers probabilistically
- **`fallback`**: Use only when Gemini pool is unavailable

## API Endpoints

### OpenAI Compatible
- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completions (streaming supported)

### Claude Compatible
- `POST /v1/messages` - Messages API (streaming supported)
- `POST /v1/messages/count_tokens` - Token counting
- `GET /v1/models/claude` - List Claude models

### Management API
- `GET /accounts` - List Google accounts
- `POST /oauth/start` - Start OAuth flow
- `GET /config` - Get configuration
- `GET /monitor` - Request logs and usage stats

## Usage Examples

### Native Anthropic API
```bash
curl -X POST http://localhost:8094/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024,
    "stream": true
  }'
```

### Groq (via OpenAI protocol)
```bash
curl -X POST http://localhost:8094/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "groq:llama-3.3-70b-versatile",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

### Together AI
```bash
curl -X POST http://localhost:8094/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "together:meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Architecture

Inspired by [Antigravity-Manager](https://github.com/example/antigravity-manager)'s multi-provider design:

```
Client Request
    ↓
Provider Dispatch (check mode & availability)
    ↓
├─ Anthropic API ────→ Native Claude models
├─ Groq API ─────────→ Fast OSS models
├─ Together AI ──────→ 100+ OSS models
└─ Gemini (Google) ──→ Free tier, default fallback
    ↓
Response (streaming or non-streaming)
```

## Project Structure

```
src/
├── api/            # Management API routes
├── auth/           # OAuth handlers
├── config/         # Configuration & settings
├── db/             # Database schema
└── proxy/
    ├── handlers/   # OpenAI, Claude, Gemini handlers
    ├── mappers/    # Protocol transformations
    ├── middleware/ # Auth, monitoring
    ├── providers/  # Multi-provider integrations
    │   ├── anthropic.ts
    │   ├── groq.ts
    │   ├── together.ts
    │   └── types.ts
    ├── token-manager.ts
    └── upstream.ts
```

## Building from Source

```bash
# Development
npm run dev

# Production build
npm run build
npm start

# Database migrations
npm run db:generate
npm run db:migrate
```

## Requirements

- Node.js 18+
- TypeScript 5.7+
- SQLite (via better-sqlite3)

## Documentation

- [Provider Configuration](docs/PROVIDERS.md) - Multi-provider setup guide
- [Architecture](02-ARCHITECTURE.md) - System design
- [Backend Guide](03-BACKEND-GUIDE.md) - API reference
- [Proxy Server](04-PROXY-SERVER.md) - Proxy architecture

## License

MIT
