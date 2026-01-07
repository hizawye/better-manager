# Changelog

## [0.2.0] - 2026-01-08

### Fixed
- Model routing now uses correct Cloud Code API models
  - Previously used non-existent `gemini-2.5-*` models causing 404 errors
  - Now correctly routes to available models: `claude-opus-4-5-thinking`, `claude-sonnet-4-5-thinking`, `claude-sonnet-4-5`, `gemini-3-pro-high`, `gemini-3-pro-low`, `gemini-3-pro-image`
- JSON Schema sanitization for Gemini API compatibility
  - Strips unsupported fields like `propertyNames`, `additionalProperties` from tool schemas
  - Uses allowlist approach for supported fields

### Added
- Custom model mappings API (`/mappings` endpoint)
  - GET `/mappings` - list all mappings (built-in and custom)
  - POST `/mappings` - add/update custom mapping
  - DELETE `/mappings/:from` - remove custom mapping
- Model mappings UI in Proxy page
  - View all built-in Claude and OpenAI model mappings
  - Add/remove custom mappings via the web interface
  - Dropdown of available target models for easy selection
- Account quota display in Accounts page
  - Shows Pro, Flash, and Image quota remaining with progress bars
  - Fetches real-time quota from Cloud Code API
  - Refresh button to update quota for individual accounts
- Quota fetching from Cloud Code API (`/v1internal:loadCodeAssist`)
- React frontend with Vite + TypeScript + DaisyUI
  - Dashboard, Accounts, Proxy, Monitor, and Providers pages
  - Multi-language support (i18n)
  - Light/dark theme support
- Native Anthropic provider support with dispatch modes (off/always/fallback)
- Streaming support for Claude and OpenAI handlers

### Changed
- Updated default model mappings:
  - `claude-opus-4-5-20251101` → `claude-opus-4-5-thinking`
  - `claude-opus-4-20250514` → `claude-opus-4-5-thinking`
  - `claude-3-5-sonnet-*` → `claude-sonnet-4-5`
  - `claude-sonnet-4-*` → `claude-sonnet-4-5`
  - `claude-3-opus-*` → `gemini-3-pro-high`
  - `gpt-4`, `gpt-4-turbo`, `o1-*` → `gemini-3-pro-high`
  - `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo` → `gemini-3-pro-low`
  - Background tasks → `gemini-3-pro-low`
- Thinking mode now uses Claude thinking models (`claude-opus-4-5-thinking`, `claude-sonnet-4-5-thinking`)
- Vision requests route to `gemini-3-pro-image`
