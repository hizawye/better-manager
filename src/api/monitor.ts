import { Router } from 'express';
import { db } from '../db/index.js';
import { proxyMonitorLogs } from '../db/schema.js';
import { desc, sql, count } from 'drizzle-orm';
import { tokenManager } from '../proxy/token-manager.js';
import { rateLimiter } from '../proxy/rate-limiter.js';
import { sessionManager } from '../proxy/session-manager.js';

const router = Router();

// Get logs with pagination
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const rawLogs = await db
      .select()
      .from(proxyMonitorLogs)
      .orderBy(desc(proxyMonitorLogs.timestamp))
      .limit(limit)
      .offset(offset);

    // Transform to snake_case for frontend compatibility
    const logs = rawLogs.map(log => ({
      id: log.id,
      timestamp: log.timestamp,
      method: log.method,
      path: log.path,
      account_email: log.accountEmail,
      model: log.model,
      status_code: log.statusCode,
      latency_ms: log.latencyMs,
      tokens_in: log.inputTokens,
      tokens_out: log.outputTokens,
      error_message: log.errorMessage,
    }));

    const totalResult = await db
      .select({ count: count() })
      .from(proxyMonitorLogs);

    const total = totalResult[0]?.count || 0;

    res.json({
      logs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to get logs:', error);
    res.status(500).json({ error: 'Failed to get logs' });
  }
});

// Clear all logs
router.delete('/logs', async (req, res) => {
  try {
    const result = await db.delete(proxyMonitorLogs);
    res.json({ deleted: result.changes || 0 });
  } catch (error) {
    console.error('Failed to clear logs:', error);
    res.status(500).json({ error: 'Failed to clear logs' });
  }
});

// Get statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await db
      .select({
        totalRequests: count(),
        successCount: sql<number>`sum(case when ${proxyMonitorLogs.statusCode} < 400 then 1 else 0 end)`,
        errorCount: sql<number>`sum(case when ${proxyMonitorLogs.statusCode} >= 400 then 1 else 0 end)`,
        avgLatency: sql<number>`avg(${proxyMonitorLogs.latencyMs})`,
        totalInputTokens: sql<number>`sum(${proxyMonitorLogs.inputTokens})`,
        totalOutputTokens: sql<number>`sum(${proxyMonitorLogs.outputTokens})`,
      })
      .from(proxyMonitorLogs);

    const result = stats[0] || {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      avgLatency: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    res.json(result);
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Get rate limit status for all accounts
router.get('/rate-limits', async (_req, res) => {
  try {
    const status = tokenManager.getRateLimitStatus();
    const stats = rateLimiter.getStats();
    const recentEvents = rateLimiter.getRecentEvents(20);

    res.json({
      accounts: status,
      stats,
      recentEvents,
    });
  } catch (error) {
    console.error('Failed to get rate limits:', error);
    res.status(500).json({ error: 'Failed to get rate limits' });
  }
});

// Get rate limit events for a specific account
router.get('/rate-limits/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const events = rateLimiter.getEventsForAccount(accountId);

    res.json({ accountId, events });
  } catch (error) {
    console.error('Failed to get rate limit events:', error);
    res.status(500).json({ error: 'Failed to get rate limit events' });
  }
});

// Clear rate limit event history
router.delete('/rate-limits/events', async (_req, res) => {
  try {
    rateLimiter.clearEvents();
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to clear rate limit events:', error);
    res.status(500).json({ error: 'Failed to clear rate limit events' });
  }
});

// Get session statistics
router.get('/sessions', async (_req, res) => {
  try {
    const stats = sessionManager.getStats();
    const bindings = sessionManager.getActiveBindings();
    const stickyConfig = tokenManager.getStickyConfig();

    res.json({
      config: stickyConfig,
      stats,
      activeBindings: bindings.slice(0, 100), // Limit to 100 for performance
    });
  } catch (error) {
    console.error('Failed to get session info:', error);
    res.status(500).json({ error: 'Failed to get session info' });
  }
});

// Get sessions for a specific account
router.get('/sessions/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    const bindings = sessionManager.getBindingsForAccount(accountId);

    res.json({ accountId, bindings });
  } catch (error) {
    console.error('Failed to get account sessions:', error);
    res.status(500).json({ error: 'Failed to get account sessions' });
  }
});

// Clear all sessions
router.delete('/sessions', async (_req, res) => {
  try {
    sessionManager.clearAll();
    tokenManager.clearAllSessions();
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to clear sessions:', error);
    res.status(500).json({ error: 'Failed to clear sessions' });
  }
});

// Cleanup expired sessions
router.post('/sessions/cleanup', async (_req, res) => {
  try {
    const cleaned = sessionManager.cleanupExpired();
    res.json({ cleaned });
  } catch (error) {
    console.error('Failed to cleanup sessions:', error);
    res.status(500).json({ error: 'Failed to cleanup sessions' });
  }
});

export default router;
