# OpenAI Streaming Implementation

## Code to add after line 75 (replacing the non-streaming section)

```typescript
        const geminiBody = transformOpenAIRequest(openaiReq, mappedModel);

        if (stream) {
          // === STREAMING MODE ===
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          const response = await upstreamClient.callGenerateContent(
            mappedModel,
            'streamGenerateContent',
            accessToken,
            projectId,
            geminiBody,
            'alt=sse'
          );

          if (!response.ok) {
            const status = response.status;
            const errorText = await response.text();

            if (status === 429 || status === 503 || status === 529) {
              const retryAfter = response.headers.get('Retry-After');
              tokenManager.markRateLimited(email, status, retryAfter ?? undefined, errorText);
              continue;
            }

            res.write('data: ' + JSON.stringify({ error: { message: errorText, type: 'api_error' } }) + '\\n\\n');
            res.end();
            return;
          }

          // Process SSE stream
          const reader = response.body?.getReader();
          if (!reader) {
            res.write('data: ' + JSON.stringify({ error: { message: 'No response body', type: 'api_error' } }) + '\\n\\n');
            res.end();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = '';
          const chunkId = 'chatcmpl-' + crypto.randomBytes(12).toString('hex');

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;

                if (trimmed.startsWith('data:')) {
                  const data = trimmed.substring(5).trim();
                  if (data === '