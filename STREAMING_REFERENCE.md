# Streaming Implementation Reference

## Status
- ✅ Non-streaming OpenAI handler: WORKING  
- ⏸️ Streaming support: Need to add SSE processing

## Where to Add Streaming Code

In `src/proxy/handlers/openai.ts`, replace the section starting at line 77:

```typescript
// Current code (line 77-84):
        const geminiBody = transformOpenAIRequest(openaiReq, mappedModel);

        // For now, only support non-streaming
        const response = await upstreamClient.callGenerateContent(
          mappedModel,
          'generateContent',
          accessToken,
          projectId,
          geminiBody
        );
```

## Replace With

See the file `/home/nagara/dev/better-manager/openai_streaming_complete.ts` for the full implementation.

The key additions:
1. Check `if (stream)` to branch logic
2. Set SSE headers for streaming
3. Call `streamGenerateContent` instead of `generateContent`  
4. Process response body as a ReadableStream
5. Parse SSE lines and unwrap Gemini chunks
6. Transform using `transformOpenAIStreamChunk()`
7. Write as `data: {json}\n\n` format
8. Send `
