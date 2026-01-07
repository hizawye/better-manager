import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/settings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import API routes
import accountsRouter from './api/accounts.js';
import configRouter from './api/config.js';
import monitorRouter from './api/monitor.js';
import oauthRouter from './auth/routes.js';
import providersRouter from './api/providers.js';
import mappingsRouter from './api/mappings.js';

// Import proxy components
import {
  openaiHandler,
  claudeHandler,
  geminiHandler,
  mcpHandler,
  authMiddleware,
  monitorMiddleware,
  tokenManager,
} from './proxy/index.js';

const app = express();

// Global middleware
app.use(cors());
app.use(express.json({ limit: '100mb' }));

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '0.1.0',
  });
});

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok' });
});

// Management API routes (no proxy auth)
app.use('/accounts', accountsRouter);
app.use('/config', configRouter);
app.use('/monitor', monitorRouter);
app.use('/oauth', oauthRouter);
app.use('/providers', providersRouter);
app.use('/mappings', mappingsRouter);

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDistPath));

  // Catch-all route for React Router (must be before proxy routes)
  app.get('*', (req, res, next) => {
    // Skip API and proxy routes
    if (req.path.startsWith('/v1') ||
        req.path.startsWith('/v1beta') ||
        req.path.startsWith('/mcp') ||
        req.path.startsWith('/accounts') ||
        req.path.startsWith('/config') ||
        req.path.startsWith('/monitor') ||
        req.path.startsWith('/oauth') ||
        req.path.startsWith('/providers') ||
        req.path.startsWith('/mappings') ||
        req.path.startsWith('/health')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
}

// Proxy routes with auth and monitoring middleware
// OpenAI-compatible endpoints
app.use('/v1', authMiddleware, monitorMiddleware, openaiHandler);

// Claude-compatible endpoints
app.use('/v1', authMiddleware, monitorMiddleware, claudeHandler);

// Gemini native endpoints
app.use('/v1beta', authMiddleware, monitorMiddleware, geminiHandler);

// MCP (Model Context Protocol) endpoints
app.use('/mcp', authMiddleware, monitorMiddleware, mcpHandler);

// Start server and load accounts
const port = config.port;
const host = config.host;

async function start() {
  // Load accounts into token manager
  try {
    const count = await tokenManager.loadAccounts();
    console.log(`Loaded ${count} accounts into token pool`);
  } catch (err) {
    console.warn('Failed to load accounts:', err);
  }

  app.listen(port, host, () => {
    console.log(`🚀 Better Manager v0.1.0`);
    console.log(`   Server: http://${host}:${port}`);
    console.log(`   Health: http://${host}:${port}/health`);
    console.log(`   Proxy:  http://${host}:${port}/v1/chat/completions`);
  });
}

start();

export default app;
