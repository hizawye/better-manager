import { Router } from 'express';
import { db } from '../db/index.js';
import { proxyMonitorLogs } from '../db/schema.js';
import { desc, sql, count } from 'drizzle-orm';

const router = Router();

// Get logs with pagination
router.get('/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const logs = await db
      .select()
      .from(proxyMonitorLogs)
      .orderBy(desc(proxyMonitorLogs.timestamp))
      .limit(limit)
      .offset(offset);

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

export default router;
