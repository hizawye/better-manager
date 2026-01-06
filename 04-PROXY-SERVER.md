# Proxy Server Deep Dive

## What is the Proxy Server?

The proxy server is an **embedded Axum HTTP server** that runs inside the Tauri application. It acts as a **protocol translator and load balancer** between AI clients (like Claude CLI, Cursor, Cherry Studio) and upstream AI APIs (Google Gemini, Anthropic).

**Key Responsibilities**:
1. Accept requests in OpenAI, Claude, or Gemini format
2. Translate requests to Google's internal API format
3. Select an account from the pool
4. Send request to upstream API
5. Translate response back to requested format
6. Stream results back to client

## Server Architecture

```
┌─────────────────────────────────────────────────────┐
│              Axum Proxy Server                       │
│              (localhost:8045)                        │
│                                                      │
│  ┌────────────────────────────────────────────┐    │
│  │  Middleware Stack (Tower)                  │    │
│  │  ├─ CORS Layer                             │    │
│  │  ├─ Auth Layer (API key check)             │    │
│  │  ├─ Monitor Layer (logging)                │    │
│  │  └─ Rate Limit Layer                       │    │
│  └─────────────┬──────────────────────────────┘    │
│                │                                     │
│  ┌─────────────▼──────────────────────────────┐    │
│  │  Router (Axum)                             │    │
│  │  ├─ /v1/chat/completions → OpenAI Handler  │    │
│  │  ├─ /v1/messages         → Claude Handler  │    │
│  │  └─ /v1beta/models/:model → Gemini Handler │    │
│  └─────────────┬──────────────────────────────┘    │
│                │                                     │
│  ┌─────────────▼──────────────────────────────┐    │
│  │  Handlers (Process Request)                │    │
│  │  ├─ Parse request body                     │    │
│  │  ├─ Extract session info                   │    │
│  │  └─ Call appropriate mapper                │    │
│  └─────────────┬──────────────────────────────┘    │
│                │                                     │
│  ┌─────────────▼──────────────────────────────┐    │
│  │  Protocol Mappers                          │    │
│  │  ├─ OpenAI → Gemini                        │    │
│  │  ├─ Claude → Gemini                        │    │
│  │  └─ Gemini → Gemini (passthrough)          │    │
│  └─────────────┬──────────────────────────────┘    │
│                │                                     │
│  ┌─────────────▼──────────────────────────────┐    │
│  │  Token Manager                             │    │
│  │  - Select account from pool                │    │
│  │  - Handle rate limits                      │    │
│  │  - Session stickiness                      │    │
│  └─────────────┬──────────────────────────────┘    │
│                │                                     │
│  ┌─────────────▼──────────────────────────────┐    │
│  │  Upstream Client                           │    │
│  │  - Add auth headers                        │    │
│  │  - Make HTTP request                       │    │
│  │  - Handle retries                          │    │
│  └─────────────┬──────────────────────────────┘    │
└────────────────┼────────────────────────────────────┘
                 │
                 ▼
        ┌────────────────────┐
        │  Google Gemini API │
        └────────────────────┘
```

## Routing System

### Route Definitions (`proxy/server.rs`)

```rust
let app = Router::new()
    // ===== OpenAI Protocol =====
    .route("/v1/models", 
        get(handlers::openai::handle_list_models))
    
    .route("/v1/chat/completions", 
        post(handlers::openai::handle_chat_completions))
    
    .route("/v1/completions", 
        post(handlers::openai::handle_completions))
    
    .route("/v1/responses", 
        post(handlers::openai::handle_completions))
    
    .route("/v1/images/generations", 
        post(handlers::openai::handle_images_generations))
    
    // ===== Claude (Anthropic) Protocol =====
    .route("/v1/messages", 
        post(handlers::claude::handle_messages))
    
    .route("/v1/messages/count_tokens", 
        post(handlers::claude::handle_count_tokens))
    
    .route("/v1/models/claude", 
        get(handlers::claude::handle_list_models))
    
    // ===== Gemini (Native) Protocol =====
    .route("/v1beta/models", 
        get(handlers::gemini::handle_list_models))
    
    .route("/v1beta/models/:model", 
        get(handlers::gemini::handle_get_model)
        .post(handlers::gemini::handle_generate))
    
    .route("/v1beta/models/:model/countTokens", 
        post(handlers::gemini::handle_count_tokens))
    
    // ===== MCP (Model Context Protocol) =====
    .route("/mcp/web_search_prime/mcp", 
        any(handlers::mcp::handle_web_search_prime))
    
    // ===== Utility Routes =====
    .route("/healthz", get(health_check_handler))
    .route("/v1/models/detect", post(handlers::common::handle_detect_model))
```

### Middleware Stack

Applied in **reverse order** (bottom layer applied first):

```rust
.layer(DefaultBodyLimit::max(100 * 1024 * 1024)) // 100MB max
.layer(monitor_middleware)      // Request logging
.layer(auth_middleware)         // API key check
.layer(cors_layer())            // CORS headers
```

## Protocol Mappers

### OpenAI → Gemini Mapping

**Request Mapping** (`proxy/mappers/openai/request.rs`):

```rust
pub async fn map_request(
    req: &OpenAIRequest,
    account: &Account,
    model_mapping: &HashMap<String, String>,
) -> Result<GeminiRequest> {
    
    // 1. Map model name
    let gemini_model = map_model_name(&req.model, model_mapping);
    
    // 2. Convert messages
    let contents = req.messages.iter()
        .map(|msg| convert_message(msg))
        .collect();
    
    // 3. Map parameters
    let generation_config = GenerationConfig {
        temperature: req.temperature,
        top_p: req.top_p,
        max_output_tokens: req.max_tokens,
        stop_sequences: req.stop.clone(),
    };
    
    // 4. Handle tools/functions
    let tools = req.tools.as_ref()
        .map(|t| convert_tools(t));
    
    // 5. Build Gemini request
    Ok(GeminiRequest {
        contents,
        generation_config,
        tools,
        system_instruction: extract_system_message(&req.messages),
    })
}
```

**Response Mapping** (`proxy/mappers/openai/response.rs`):

```rust
pub async fn map_streaming_response(
    gemini_stream: impl Stream<Item = GeminiChunk>,
) -> impl Stream<Item = Result<OpenAIChunk>> {
    
    gemini_stream.map(|chunk| {
        // Convert Gemini SSE → OpenAI SSE
        let delta = ChatCompletionDelta {
            role: Some("assistant"),
            content: chunk.candidates[0].content.parts[0].text.clone(),
            tool_calls: convert_tool_calls(&chunk),
        };
        
        Ok(OpenAIChunk {
            id: generate_id(),
            object: "chat.completion.chunk",
            created: timestamp(),
            model: chunk.model,
            choices: vec![Choice {
                index: 0,
                delta,
                finish_reason: chunk.candidates[0].finish_reason.clone(),
            }],
        })
    })
}
```

### Claude → Gemini Mapping

**Key Differences**:
- Claude uses `content` blocks (text, image, tool_use, tool_result)
- Gemini uses `parts` (text, inline_data, function_call, function_response)
- Claude has "thinking mode" (extended thinking blocks)
- Gemini requires role alternation (user/model/user/model)

**Request Mapper** (`proxy/mappers/claude/request.rs`):

```rust
pub async fn map_claude_to_gemini(
    req: &ClaudeRequest,
    account: &Account,
) -> Result<GeminiRequest> {
    
    // 1. Handle thinking mode
    let thinking_enabled = req.thinking.unwrap_or(false);
    
    // 2. Convert content blocks
    let mut contents = vec![];
    for msg in &req.messages {
        let parts = msg.content.iter()
            .filter_map(|block| match block {
                ContentBlock::Text { text } => {
                    Some(Part::Text { text: text.clone() })
                }
                ContentBlock::Image { source } => {
                    Some(Part::InlineData {
                        mime_type: source.media_type.clone(),
                        data: source.data.clone(),
                    })
                }
                ContentBlock::ToolUse { id, name, input } => {
                    Some(Part::FunctionCall {
                        name: name.clone(),
                        args: input.clone(),
                    })
                }
                ContentBlock::Thinking { thought } if thinking_enabled => {
                    // Special handling for thinking blocks
                    Some(Part::Thought {
                        thought: thought.clone(),
                        signature: extract_signature(...),
                    })
                }
                _ => None,
            })
            .collect();
        
        contents.push(Content {
            role: msg.role.clone(),
            parts,
        });
    }
    
    // 3. Enforce role alternation
    contents = enforce_alternating_roles(contents);
    
    // 4. Build request
    Ok(GeminiRequest { contents, ... })
}
```

## Token Manager Strategies

### Scheduling Modes

```rust
pub enum SchedulingMode {
    /// Maximize cache hits (reuse same account)
    CacheFirst,
    
    /// Balance between caching and distribution
    Balanced,
    
    /// Maximize throughput (rotate aggressively)
    Performance,
}
```

### Session Stickiness

**Purpose**: Keep the same account for a conversation to maximize prompt caching.

```rust
pub struct SessionManager {
    // Maps session_id → (email, last_used_time)
    sessions: Arc<DashMap<String, (String, Instant)>>,
    sticky_window: Duration, // Default: 60 seconds
}

impl SessionManager {
    pub fn register_session(&self, session_id: &str, email: &str) {
        self.sessions.insert(
            session_id.to_string(),
            (email.to_string(), Instant::now()),
        );
    }
    
    pub fn get_account(&self, session_id: &str) -> Option<String> {
        self.sessions.get(session_id)
            .filter(|(_, last_used)| last_used.elapsed() < self.sticky_window)
            .map(|(email, _)| email.clone())
    }
}
```

### Rate Limit Tracking

```rust
pub struct RateLimitTracker {
    limits: Arc<DashMap<String, RateLimitInfo>>,
}

pub struct RateLimitInfo {
    pub until: Instant,
    pub reason: RateLimitReason,
    pub retry_after: Duration,
}

pub enum RateLimitReason {
    QuotaExhausted,      // 429: Quota limit hit (1 hour default)
    RateLimitExceeded,   // 429: Too many requests (30s default)
    AccountForbidden,    // 403: Account disabled
}

impl RateLimitTracker {
    pub fn mark_limited(&self, email: &str, info: RateLimitInfo) {
        self.limits.insert(email.to_string(), info);
    }
    
    pub fn is_limited(&self, email: &str) -> bool {
        self.limits.get(email)
            .map(|info| Instant::now() < info.until)
            .unwrap_or(false)
    }
    
    pub fn parse_retry_delay(error: &GeminiError) -> Duration {
        // Parse "quotaResetDelay": "2h21m25.831s"
        if let Some(delay_str) = error.metadata.quota_reset_delay {
            parse_duration_string(&delay_str)
                .unwrap_or(Duration::from_secs(3600))
        } else {
            Duration::from_secs(60) // Default
        }
    }
}
```

## Error Handling & Retries

### Retry Strategy

```rust
pub async fn send_with_retry(
    request: UpstreamRequest,
    account: &Account,
    max_retries: usize,
) -> Result<Response> {
    
    let mut attempt = 0;
    
    loop {
        match send_request(&request, account).await {
            Ok(response) => return Ok(response),
            
            Err(err) if should_retry(&err) && attempt < max_retries => {
                // Exponential backoff with jitter
                let base_delay = 2_u64.pow(attempt as u32);
                let jitter = rand::random::<f64>() * 0.2; // ±20%
                let delay_secs = (base_delay as f64 * (1.0 + jitter)) as u64;
                
                tracing::warn!(
                    "⏱️ Retry attempt {}/{} after {}s: {:?}",
                    attempt + 1, max_retries, delay_secs, err
                );
                
                tokio::time::sleep(Duration::from_secs(delay_secs)).await;
                attempt += 1;
            }
            
            Err(err) => return Err(err),
        }
    }
}

fn should_retry(err: &ProxyError) -> bool {
    matches!(err,
        ProxyError::ServerOverload      // 529, 503
        | ProxyError::RateLimit         // 429
        | ProxyError::Timeout           // 408
    )
}
```

### Error Types

```rust
pub enum ProxyError {
    // Retryable errors
    ServerOverload(String),      // 503, 529
    RateLimit(String),           // 429
    Timeout(String),             // 408
    
    // Non-retryable errors
    InvalidRequest(String),      // 400
    Unauthorized(String),        // 401
    Forbidden(String),           // 403
    NotFound(String),            // 404
    
    // Internal errors
    MappingError(String),
    AccountError(String),
    NetworkError(String),
}
```

## Streaming Responses (SSE)

### Server-Sent Events Format

```rust
pub fn stream_sse_response(
    gemini_stream: impl Stream<Item = Result<GeminiChunk>>,
) -> Response {
    
    let sse_stream = gemini_stream.map(|chunk_result| {
        match chunk_result {
            Ok(chunk) => {
                // Convert to SSE format
                let data = serde_json::to_string(&chunk).unwrap();
                Ok(Event::default()
                    .event("message")
                    .data(data))
            }
            Err(e) => {
                Err(e)
            }
        }
    });
    
    Sse::new(sse_stream)
        .keep_alive(KeepAlive::default())
        .into_response()
}
```

## Monitoring

### Request Logging (`proxy/monitor.rs`)

```rust
pub struct ProxyMonitor {
    db: Arc<Mutex<Connection>>,
}

pub struct MonitorLog {
    pub id: i64,
    pub timestamp: i64,
    pub method: String,
    pub path: String,
    pub status: u16,
    pub latency_ms: u64,
    pub account_email: String,
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
}

impl ProxyMonitor {
    pub async fn log_request(&self, log: MonitorLog) -> Result<()> {
        let db = self.db.lock().unwrap();
        db.execute(
            "INSERT INTO proxy_monitor_logs (...) VALUES (...)",
            params![...],
        )?;
        Ok(())
    }
    
    pub async fn get_recent_logs(&self, limit: usize) -> Result<Vec<MonitorLog>> {
        // Query database
    }
}
```

## Security Features

### API Key Authentication (`proxy/middleware/auth.rs`)

```rust
pub async fn auth_middleware(
    State(security): State<Arc<RwLock<ProxySecurityConfig>>>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    
    let config = security.read().await;
    
    // Skip auth if disabled
    if !config.require_auth {
        return Ok(next.run(req).await);
    }
    
    // Extract Authorization header
    let auth_header = req.headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok());
    
    let provided_key = match auth_header {
        Some(header) if header.starts_with("Bearer ") => {
            &header[7..]
        }
        _ => return Err(StatusCode::UNAUTHORIZED),
    };
    
    // Verify key
    if provided_key != config.api_key {
        return Err(StatusCode::FORBIDDEN);
    }
    
    Ok(next.run(req).await)
}
```

### CORS Configuration (`proxy/middleware/cors.rs`)

```rust
pub fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any)
        .allow_credentials(false)
        .max_age(Duration::from_secs(3600))
}
```

## Performance Optimizations

1. **Connection Pooling**: Reuse HTTP connections to Google API
2. **Async Streaming**: Process data as it arrives (no buffering)
3. **Zero-Copy**: Minimal data copying using `bytes::Bytes`
4. **Session Caching**: Prompt caching via session stickiness
5. **Concurrent Requests**: Handle multiple requests in parallel
6. **Smart Routing**: Route background tasks to cheaper models

## Configuration Hot-Reload

```rust
impl AxumServer {
    pub async fn update_mapping(&self, config: &ProxyConfig) {
        // Update mappings without restarting server
        let mut mapping = self.anthropic_mapping.write().await;
        *mapping = config.anthropic_mapping.clone();
        tracing::info!("Model mapping hot-reloaded");
    }
    
    pub async fn update_proxy(&self, config: UpstreamProxyConfig) {
        let mut proxy = self.proxy_state.write().await;
        *proxy = config;
        tracing::info!("Proxy config hot-reloaded");
    }
}
```

## Testing the Proxy

### cURL Examples

```bash
# OpenAI format
curl -X POST http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-3-pro",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Claude format
curl -X POST http://localhost:8045/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Gemini format
curl -X POST http://localhost:8045/v1beta/models/gemini-3-pro:generateContent \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "Hello!"}]}]
  }'
```
