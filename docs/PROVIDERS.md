# Multi-Provider Support

Better Manager supports multiple AI providers with intelligent routing and fallback capabilities.

## Supported Providers

### 1. **Gemini (Google Cloud Code)** - Default
- Uses Google accounts from the account pool
- Supports Cloud Code API models:
  - `claude-opus-4-5-thinking` - High-capability thinking model
  - `claude-sonnet-4-5-thinking` - Mid-tier thinking model
  - `claude-sonnet-4-5` - Mid-tier non-thinking model
  - `gemini-3-pro-high` - High quality/slow
  - `gemini-3-pro-low` - Lower quality/fast
  - `gemini-3-pro-image` - Image generation/vision
- Primary backend with streaming support
- Claude/OpenAI requests are automatically mapped to these models

### 2. **Anthropic (Native Claude API)**
- Direct integration with Anthropic's API or compatible endpoints (z.ai, etc.)
- Supports all Claude models (claude-opus-4-5-20251101, claude-sonnet-4-20250514, etc.)
- No mapping required - uses real Claude models
- Full streaming support
- Thinking mode support for Claude 4+ models

## Configuration

### Via Environment Variables

Add these to your `.env` file:

```bash
# Enable native Anthropic API
ANTHROPIC_PROVIDER_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-api03-...
ANTHROPIC_BASE_URL=https://api.anthropic.com  # or z.ai URL
ANTHROPIC_DISPATCH_MODE=always  # off | always | fallback
```

### Via Web UI

1. Open the Better Manager dashboard: `http://localhost:8094`
2. Navigate to **Providers** page
3. Click **Configure** on the Anthropic Provider card
4. Set your Base URL and API Key
5. Select a Dispatch Mode
6. Click **Save Configuration**

### Via API

```bash
# Update Anthropic provider configuration
curl -X PUT http://localhost:8094/providers/anthropic \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "baseUrl": "https://api.anthropic.com",
    "apiKey": "sk-ant-...",
    "dispatchMode": "always"
  }'

# Test connection
curl -X POST http://localhost:8094/providers/anthropic/test

# Toggle provider on/off
curl -X POST http://localhost:8094/providers/anthropic/toggle \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

## Dispatch Modes

### `off` (Default)
- Anthropic provider is disabled
- All Claude requests are mapped to Gemini models
- Use this if you don't have an Anthropic API key

### `always`
- All `claude-*` model requests go directly to Anthropic API
- Gemini is not used for Claude models
- Recommended when you want native Claude models

### `fallback`
- Try Gemini first for Claude requests
- Fall back to Anthropic only if Gemini fails
- Useful for cost optimization (Gemini is "free" via Cloud Code tokens)

## Model Routing Logic

1. **Check dispatch mode**
   - If `off`: Use Gemini backend (map Claude → Gemini models)
   - If `always` and model starts with `claude-`: Forward to Anthropic
   - If `fallback`: Try Gemini first, fall back to Anthropic on failure

2. **Model passthrough**
   - Anthropic provider passes the exact model name (e.g., `claude-opus-4-5-20251101`)
   - No model mapping is applied for Anthropic

3. **Default behavior**
   - If Anthropic is disabled, all requests use Gemini backend
   - OpenAI-format requests always use Gemini backend

## Usage Examples

### Example 1: Native Claude Models Only

Set dispatch mode to `always`:

```env
ANTHROPIC_PROVIDER_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DISPATCH_MODE=always
```

All Claude requests go directly to Anthropic API:
```bash
curl -X POST http://localhost:8094/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-proxy-key" \
  -d '{
    "model": "claude-opus-4-5-20251101",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 1024
  }'
```

### Example 2: Gemini Primary, Anthropic Fallback

```env
ANTHROPIC_PROVIDER_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DISPATCH_MODE=fallback
```

Uses Gemini accounts first. Falls back to Anthropic if all Gemini accounts are rate-limited or unavailable.

### Example 3: Cost Optimization (Gemini Only)

```env
ANTHROPIC_PROVIDER_ENABLED=false
# or
ANTHROPIC_DISPATCH_MODE=off
```

All Claude requests are mapped to Gemini models. No Anthropic API costs.

## Streaming Support

Both providers support streaming responses:

```bash
# Streaming with native Claude via Anthropic
curl -X POST http://localhost:8094/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-proxy-key" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Write a poem"}],
    "max_tokens": 1024,
    "stream": true
  }'
```

## Extended Thinking Support

When using Anthropic provider with Claude 4+ models, extended thinking is fully supported:

```bash
curl -X POST http://localhost:8094/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4-5-20251101",
    "messages": [{"role": "user", "content": "Solve this complex problem..."}],
    "max_tokens": 16000,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 10000
    }
  }'
```

## Provider Status Logging

The proxy logs which provider handles each request:

```
[Claude] Using Anthropic provider for claude-opus-4-5-20251101
[Anthropic] Forwarding to https://api.anthropic.com/v1/messages, model=claude-opus-4-5-20251101, stream=true
```

## Compatible Anthropic Endpoints

The Anthropic provider works with any Anthropic-compatible API:

| Service | Base URL |
|---------|----------|
| Anthropic (Official) | `https://api.anthropic.com` |
| z.ai | Your z.ai endpoint URL |
| AWS Bedrock (with adapter) | Custom adapter URL |
| Azure OpenAI (with adapter) | Custom adapter URL |

## Troubleshooting

### Anthropic provider not being used

1. Verify `ANTHROPIC_PROVIDER_ENABLED=true` in `.env`
2. Check dispatch mode is `always` or `fallback`, not `off`
3. Confirm API key is set and valid
4. Review logs for routing decisions

### Connection test failing

1. Check Base URL is correct (include https://)
2. Verify API key format (should start with `sk-ant-`)
3. Test with curl directly to the Anthropic API
4. Check for network/firewall issues

### Thinking mode errors

1. Ensure you're using Claude 4+ models
2. Set appropriate `max_tokens` (thinking uses tokens from this budget)
3. The Anthropic provider automatically handles thinking blocks

### Streaming not working

1. Check response headers for `Content-Type: text/event-stream`
2. Disable any response buffering (nginx: `X-Accel-Buffering: no`)
3. Verify client supports SSE format

## Architecture

```
┌─────────────────┐
│   Claude Code   │
│   (Client)      │
└────────┬────────┘
         │ POST /v1/messages
         ▼
┌─────────────────┐
│ Better Manager  │
│  Claude Handler │
└────────┬────────┘
         │ shouldUseAnthropicProvider(model)?
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌───────┐ ┌────────────┐
│Gemini │ │ Anthropic  │
│Backend│ │  Provider  │
└───────┘ └────────────┘
    │         │
    ▼         ▼
┌───────┐ ┌────────────┐
│Cloud  │ │api.anthropic│
│Code   │ │.com / z.ai │
└───────┘ └────────────┘
```
