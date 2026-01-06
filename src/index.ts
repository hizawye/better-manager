import express from 'express';
import cors from 'cors';
import { config } from './config/settings.js';

// Import routes
import accountsRouter from './api/accounts.js';
import configRouter from './api/config.js';
import monitorRouter from './api/monitor.js';
import oauthRouter from './auth/routes.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: process.env.npm_package_version || '0.1.0',
  });
});

// API routes
app.use('/accounts', accountsRouter);
app.use('/config', configRouter);
app.use('/monitor', monitorRouter);
app.use('/oauth', oauthRouter);

// Start server
const port = config.port;
const host = config.host;

app.listen(port, host, () => {
  console.log(`🚀 Better Manager v0.1.0`);
  console.log(`   Server: http://${host}:${port}`);
  console.log(`   Health: http://${host}:${port}/health`);
});

export default app;
