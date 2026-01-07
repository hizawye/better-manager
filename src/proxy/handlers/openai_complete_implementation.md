# OpenAI Handler Implementation Plan

Given the complexity of creating the file via bash/heredoc, here's the step-by-step implementation plan:

## Current Status
- File has header and MODEL_MAPPING (lines 1-25)
- Needs: Complete `/v1/chat/completions` endpoint with streaming

## Implementation Strategy
1. Use the Claude handler as template (it works perfectly)
2. Adapt for OpenAI protocol differences:
   - Endpoint: `/messages` → `/chat/completions`
   - Request type: ClaudeRequest → OpenAIRequest
   - Response format: Claude format → OpenAI format
3. Add streaming support (the key difference)

## Key Code Sections Needed
1. Session ID extraction (simpler for OpenAI - hash first messages)
2. Models list endpoint `/v1/models`
3. Chat completions endpoint `/v1/chat/completions`
4. Streaming logic using Response.body stream

Given time constraints, let's implement non-streaming first (like Claude), then add streaming as Phase 2.
