# Quick Provider Setup Guide

## 1. Copy Environment Template
```bash
cp .env.example .env
```

## 2. Enable Providers

### For Native Anthropic (Real Claude Models)
```bash
ANTHROPIC_ENABLED=true
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
ANTHROPIC_DISPATCH_MODE=fallback  # or: exclusive, pooled, off
```

### For Groq (Fast Inference)
```bash
GROQ_ENABLED=true
GROQ_API_KEY=gsk_your-key-here
GROQ_DISPATCH_MODE=fallback
```

### For Together AI (Open Models)
```bash
TOGETHER_ENABLED=true
TOGETHER_API_KEY=your-key-here
TOGETHER_DISPATCH_MODE=fallback
```

## 3. Start Server
```bash
npm run dev
```

## 4. Test Providers

### Test Anthropic
```bash
curl -X POST http://localhost:8094/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hi!"}],
    "max_tokens": 100
  }'
```

### Test Groq
```bash
curl -X POST http://localhost:8094/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "groq:llama-3.3-70b-versatile",
    "messages": [{"role": "user", "content": "Hi!"}]
  }'
```

### Test Together AI
```bash
curl -X POST http://localhost:8094/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "together:llama",
    "messages": [{"role": "user", "content": "Hi!"}]
  }'
```

## Dispatch Mode Cheat Sheet

| Mode | When to Use | Behavior |
|------|-------------|----------|
| `off` | Don't use provider | Provider disabled |
| `exclusive` | Always use this provider | No fallback to Gemini |
| `pooled` | Load balance | Distribute requests across all providers |
| `fallback` | **Recommended** | Use when Gemini unavailable |

## Common Setups

### Free First, Paid Backup
```bash
# Use free Gemini, fallback to paid providers when rate-limited
ANTHROPIC_ENABLED=true
ANTHROPIC_DISPATCH_MODE=fallback
GROQ_ENABLED=true
GROQ_DISPATCH_MODE=fallback
```

### Best Quality
```bash
# Route all Claude requests to real Anthropic API
ANTHROPIC_ENABLED=true
ANTHROPIC_DISPATCH_MODE=exclusive
```

### Fast Inference
```bash
# Route OpenAI requests to Groq for speed
GROQ_ENABLED=true
GROQ_DISPATCH_MODE=exclusive
```

## Troubleshooting

**Provider not working?**
1. Check API key is correct
2. Verify `*_ENABLED=true`
3. Check dispatch mode is not `off`
4. Look for error logs in console

**Want fallback?**
- Set dispatch mode to `fallback`, NOT `exclusive`
- Exclusive mode will return errors instead of falling back

## More Info

See [docs/PROVIDERS.md](docs/PROVIDERS.md) for complete documentation.
