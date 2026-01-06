import express from 'express';
import cors from 'cors';
import { config } from './config/settings.js';

// Import API routes
import accountsRouter from './api/accounts.js';
import configRouter from './api/config.js';
import monitorRouter from './api/monitor.js';
import oauthRouter from './auth/routes.js';

// Import proxy components
import {
  openaiHandler,
  claudeHandler,
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

// Proxy routes with auth and monitoring middleware
// OpenAI-compatible endpoints
app.use('/v1', authMiddleware, monitorMiddleware, openaiHandler);

// Claude-compatible endpoints
app.use('/v1', authMiddleware, monitorMiddleware, claudeHandler);

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
