# Routing & Model Mapping System

## Overview

The routing system is responsible for:
1. **Model Name Translation**: Map client-requested models to upstream models
2. **Account Selection**: Choose which account to use for a request
3. **Protocol Routing**: Direct requests to appropriate handlers
4. **Smart Optimization**: Route background tasks to cheaper models

## Model Mapping Architecture

### Three-Layer Mapping System

```
Client Request Model Name
    │
    ▼
┌─────────────────────────┐
│  1. Protocol Mapping    │  (Claude/OpenAI specific)
│     claude-3-sonnet     │
│     gpt-4               │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  2. Custom Mapping      │  (User-defined)
│     my-model-alias      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  3. Default Mapping     │  (Built-in)
│     gemini-3-pro        │
└────────┬────────────────┘
         │
         ▼
    Upstream Model
  (gemini-3.0-pro-latest)
```

### Configuration Structure

**Database Schema** (`proxy_config` table):

```sql
CREATE TABLE proxy_config (
    id INTEGER PRIMARY KEY,
    anthropic_mapping TEXT,  -- JSON: {"claude-3-sonnet": "gemini-3-pro"}
    openai_mapping TEXT,     -- JSON: {"gpt-4": "gemini-3-pro"}
    custom_mapping TEXT,     -- JSON: {"my-alias": "gemini-3-flash"}
    -- ... other config
);
```

**Rust Types** (`proxy/config.rs`):

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct ProxyConfig {
    pub anthropic_mapping: HashMap<String, String>,
    pub openai_mapping: HashMap<String, String>,
    pub custom_mapping: HashMap<String, String>,
    pub scheduling_mode: SchedulingMode,
    pub allow_lan_access: bool,
    pub require_auth: bool,
    pub api_key: String,
}
```

## Model Mapping Flow

### Example: Claude Request

```
1. Client sends: "claude-3-5-sonnet-20241022"
   │
   ▼
2. Handler extracts model from request
   │
   ▼
3. Check Anthropic mapping table
   anthropic_mapping.get("claude-3-5-sonnet-20241022")
   │
   ├─ Found? → Use mapped model
   │
   └─ Not found? → Check custom mapping
                   │
                   └─ Not found? → Use default mapping
```

### Mapper Code (`proxy/mappers/claude/utils.rs`):

```rust
pub fn resolve_model(
    client_model: &str,
    anthropic_mapping: &HashMap<String, String>,
    custom_mapping: &HashMap<String, String>,
) -> String {
    
    // 1. Try anthropic-specific mapping
    if let Some(mapped) = anthropic_mapping.get(client_model) {
        return mapped.clone();
    }
    
    // 2. Try custom mapping
    if let Some(mapped) = custom_mapping.get(client_model) {
        return mapped.clone();
    }
    
    // 3. Try built-in mapping
    match client_model {
        "claude-3-5-sonnet-20241022" => "gemini-3.0-pro-latest",
        "claude-3-5-sonnet" => "gemini-3.0-pro-latest",
        "claude-3-opus" => "gemini-3.0-pro-latest",
        "claude-3-sonnet" => "gemini-3.0-pro-latest",
        "claude-3-haiku" => "gemini-2.5-flash",
        _ => "gemini-2.5-flash", // Default fallback
    }.to_string()
}
```

## Built-in Model Mappings

### Claude Models

```rust
const CLAUDE_MAPPING: &[(&str, &str)] = &[
    // Sonnet (flagship)
    ("claude-3-5-sonnet-20241022", "gemini-3.0-pro-latest"),
    ("claude-3-5-sonnet", "gemini-3.0-pro-latest"),
    ("claude-3-sonnet-20240229", "gemini-3.0-pro-latest"),
    
    // Opus (most capable)
    ("claude-3-opus-20240229", "gemini-3.0-pro-latest"),
    ("claude-opus-4-5-thinking", "gemini-3.0-pro-thinking"),
    
    // Haiku (fast)
    ("claude-3-haiku-20240307", "gemini-2.5-flash"),
    ("claude-3-5-haiku", "gemini-2.5-flash"),
];
```

### OpenAI Models

```rust
const OPENAI_MAPPING: &[(&str, &str)] = &[
    // GPT-4 series  → Pro/Ultra models
    ("gpt-4", "gemini-3.0-pro-latest"),
    ("gpt-4-turbo", "gemini-3.0-pro-latest"),
    ("gpt-4o", "gemini-3.0-pro-latest"),
    ("gpt-4o-mini", "gemini-2.5-flash"),
    
    // GPT-3.5 series → Flash models
    ("gpt-3.5-turbo", "gemini-2.5-flash"),
    
    // Image models
    ("dall-e-3", "gemini-3.0-pro-image"),
];
```

## Smart Routing Features

### 1. Background Task Detection

**Purpose**: Save quota by routing low-value tasks to cheap models

```rust
pub fn is_background_task(messages: &[Message]) -> bool {
    // Check for title generation patterns
    if messages.iter().any(|m| {
        m.content.contains("write a 5-10 word title")
        || m.content.contains("Concise summary")
        || m.content.contains("prompt suggestion generator")
    }) {
        return true;
    }
    
    // Check for agent auto-tasks
    if messages.iter().any(|m| {
        m.content.contains("Next Prompt Suggestions")
        || m.content.contains("generate_title")
    }) {
        return true;
    }
    
    false
}

// In handler:
if is_background_task(&req.messages) {
    tracing::info!("🎯 Background task detected, routing to flash-lite");
    req.model = "gemini-2.5-flash-lite".to_string();
}
```

### 2. Image Model Routing

**Purpose**: Automatically select image-capable models

```rust
pub fn requires_vision(messages: &[Message]) -> bool {
    messages.iter().any(|msg| {
        msg.content.iter().any(|block| {
            matches!(block, ContentBlock::Image { .. })
        })
    })
}

pub fn resolve_image_model(
    base_model: &str,
    size: Option<&str>,
    aspect_ratio: Option<&str>,
) -> String {
    let mut model = base_model.to_string();
    
    // Add resolution suffix
    if let Some(size) = size {
        if size.contains("2560") || size.contains("2k") {
            model.push_str("-2k");
        } else if size.contains("4096") || size.contains("4k") {
            model.push_str("-4k");
        }
    }
    
    // Add aspect ratio suffix
    if let Some(ratio) = aspect_ratio {
        model.push_str(&format!("-{}", ratio));
    }
    
    model
}
```

### 3. Thinking Mode Routing

**Purpose**: Route requests with thinking mode to thinking-capable models

```rust
pub fn requires_thinking(req: &ClaudeRequest) -> bool {
    req.thinking.unwrap_or(false)
}

pub fn ensure_thinking_model(model: &str) -> String {
    if model.ends_with("-thinking") {
        model.to_string()
    } else {
        format!("{}-thinking", model)
    }
}
```

## Account Routing (Token Manager)

### Selection Algorithm

```rust
impl TokenManager {
    pub async fn select_account(
        &self,
        session_id: &str,
        model: &str,
        request_type: RequestType,
    ) -> Result<Account> {
        
        // Step 1: Check session stickiness
        if let Some(email) = self.session_manager.get_account(session_id) {
            if let Some(account) = self.find_account(&email).await {
                if !self.is_rate_limited(&account.email) {
                    return Ok(account);
                }
            }
        }
        
        // Step 2: Filter available accounts
        let accounts = self.get_available_accounts().await?;
        
        // Step 3: Apply scheduling mode
        let selected = match self.scheduling_mode {
            SchedulingMode::CacheFirst => {
                // Sort by last_used (descending)
                self.select_most_recently_used(accounts)
            }
            SchedulingMode::Performance => {
                // Round-robin distribution
                self.select_round_robin(accounts)
            }
            SchedulingMode::Balanced => {
                // Mix of both strategies
                self.select_balanced(accounts)
            }
        }?;
        
        // Step 4: Register session
        self.session_manager.register(session_id, &selected.email);
        
        Ok(selected)
    }
    
    fn get_available_accounts(&self) -> Vec<Account> {
        self.accounts.read().await.iter()
            .filter(|a| !a.is_forbidden)
            .filter(|a| !a.disabled_for_proxy)
            .filter(|a| !self.is_rate_limited(&a.email))
            .cloned()
            .collect()
    }
}
```

### Account Prioritization

```rust
pub fn prioritize_accounts(accounts: &mut Vec<Account>) {
    // Sort by:
    // 1. Subscription tier (ULTRA > PRO > FREE)
    // 2. Quota reset frequency (hourly > daily)
    // 3. Current quota level (high > low)
    
    accounts.sort_by(|a, b| {
        // Compare tier
        let tier_cmp = tier_priority(&a.subscription_tier)
            .cmp(&tier_priority(&b.subscription_tier));
        
        if tier_cmp != Ordering::Equal {
            return tier_cmp;
        }
        
        // Compare quota
        let quota_a = a.quota_info.as_ref()
            .map(|q| q.pro_quota)
            .unwrap_or(0.0);
        let quota_b = b.quota_info.as_ref()
            .map(|q| q.pro_quota)
            .unwrap_or(0.0);
        
        quota_b.partial_cmp(&quota_a).unwrap()
    });
}

fn tier_priority(tier: &Option<String>) -> u8 {
    match tier.as_deref() {
        Some("ULTRA") => 3,
        Some("PRO") => 2,
        Some("FREE") => 1,
        _ => 0,
    }
}
```

## Request Type Detection

```rust
pub enum RequestType {
    Chat,           // Normal conversation
    Image,          // Image generation
    ImageGen,       // Imagen generation
    Tool,           // Tool/function call
    Background,     // Background task (title, summary)
}

pub fn detect_request_type(req: &Request) -> RequestType {
    // Check for image generation
    if req.path.contains("/images/generations") {
        return RequestType::ImageGen;
    }
    
    // Check for vision
    if has_image_content(&req) {
        return RequestType::Image;
    }
    
    // Check for tools
    if req.tools.is_some() || req.tool_choice.is_some() {
        return RequestType::Tool;
    }
    
    // Check for background task
    if is_background_task(&req.messages) {
        return RequestType::Background;
    }
    
    RequestType::Chat
}
```

## Fallback Mechanisms

### Endpoint Fallback

```rust
pub async fn send_with_fallback(
    req: &UpstreamRequest,
    account: &Account,
) -> Result<Response> {
    
    // Try production endpoint
    match send_to_prod(req, account).await {
        Ok(resp) => return Ok(resp),
        Err(e) if should_fallback(&e) => {
            tracing::warn!("Prod endpoint failed, trying daily: {:?}", e);
        }
        Err(e) => return Err(e),
    }
    
    // Fallback to daily endpoint
    send_to_daily(req, account).await
}

fn should_fallback(err: &Error) -> bool {
    matches!(err,
        Error::NotFound          // 404
        | Error::TooManyRequests // 429
        | Error::ServerError     // 5xx
    )
}
```

### Model Fallback

```rust
pub fn get_fallback_model(model: &str) -> Option<String> {
    match model {
        // High-tier → Mid-tier
        "gemini-3.0-ultra" => Some("gemini-3.0-pro-latest"),
        "gemini-3.0-pro-latest" => Some("gemini-2.5-flash"),
        
        // Thinking → Non-thinking
        m if m.ends_with("-thinking") => {
            Some(m.trim_end_matches("-thinking").to_string())
        }
        
        _ => None,
    }
}
```

## Dynamic Model Lists

### OpenAI Models Endpoint

```rust
#[axum::debug_handler]
pub async fn handle_list_models(
    State(state): State<AppState>,
) -> Json<ModelsResponse> {
    
    let mut models = vec![
        // Built-in models
        Model { id: "gemini-3-pro", ... },
        Model { id: "gemini-2.5-flash", ... },
    ];
    
    // Add custom mappings
    let custom = state.custom_mapping.read().await;
    for (alias, target) in custom.iter() {
        models.push(Model {
            id: alias.clone(),
            object: "model",
            created: timestamp(),
            owned_by: "antigravity",
        });
    }
    
    // Add image generation variants
    for resolution in ["2k", "4k"] {
        for ratio in ["1x1", "16x9", "9x16", "21x9"] {
            models.push(Model {
                id: format!("gemini-3-pro-image-{}-{}", resolution, ratio),
                ...
            });
        }
    }
    
    Json(ModelsResponse { data: models })
}
```

## Configuration UI

### Frontend Mapping Editor (`pages/ApiProxy.tsx`)

```typescript
const [mappings, setMappings] = useState<Record<string, string>>({});

const addMapping = () => {
  const fromModel = prompt("Source model name:");
  const toModel = prompt("Target model name:");
  
  if (fromModel && toModel) {
    setMappings(prev => ({
      ...prev,
      [fromModel]: toModel
    }));
  }
};

const saveConfig = async () => {
  await invoke('update_proxy_config', {
    config: {
      ...proxyConfig,
      custom_mapping: mappings,
    }
  });
};
```

## Testing Routes

```bash
# Test model mapping
curl http://localhost:8045/v1/models

# Test custom mapping
curl -X POST http://localhost:8045/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "my-custom-alias",
    "messages": [{"role": "user", "content": "test"}]
  }'

# Test background task detection
curl -X POST http://localhost:8045/v1/messages \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-sonnet",
    "messages": [{
      "role": "user",
      "content": "write a 5-10 word title for this conversation"
    }]
  }'
```

## Best Practices

1. **Use Specific Mappings**: Map exact model IDs for predictable routing
2. **Test Fallbacks**: Ensure fallback models work as expected
3. **Monitor Logs**: Check which models are actually being used
4. **Update Regularly**: Keep mappings in sync with upstream changes
5. **Document Custom Mappings**: Comment why each mapping exists
