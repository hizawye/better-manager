# Better Manager

A lightweight, fast, and stable AI account manager and protocol proxy.

## Features

- **Multi-Account Management**: OAuth-based Google account management
- **Protocol Translation**: OpenAI, Claude, and Gemini API compatibility
- **Smart Routing**: Intelligent account rotation and session stickiness
- **Rate Limit Handling**: Automatic account switching on rate limits
- **Web Dashboard**: Browser-based management interface
- **Lightweight**: ~15-20MB binary (vs ~150MB alternatives)

## Quick Start

```bash
# Run the server
./better-manager

# Or with custom port
./better-manager --port 9000

# Open browser automatically
./better-manager --open
```

## Default Configuration

- **Port**: 8094
- **Host**: 127.0.0.1
- **Dashboard**: http://localhost:8094

## API Endpoints

### OpenAI Compatible
- `GET /v1/models` - List available models
- `POST /v1/chat/completions` - Chat completions

### Claude Compatible
- `POST /v1/messages` - Messages API
- `GET /v1/models/claude` - List Claude models

### Gemini Compatible
- `GET /v1beta/models` - List models
- `POST /v1beta/models/:model` - Generate content

### Management API
- `GET /api/accounts` - List accounts
- `POST /api/auth/start` - Start OAuth flow
- `GET /api/config` - Get configuration
- `GET /api/logs` - Get request logs

## Building from Source

```bash
# Development
cargo run

# Release build
cargo build --release

# With frontend
./scripts/build.sh
```

## Requirements

- Rust 1.70+
- Node.js 18+ (for frontend development)

## License

MIT
