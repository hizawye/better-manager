import { Router } from 'express';
import { db } from '../db/index.js';
import { proxyConfig } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// Get proxy configuration
router.get('/proxy', async (req, res) => {
  try {
    const result = await db
      .select()
      .from(proxyConfig)
      .where(eq(proxyConfig.id, 1))
      .limit(1);

    if (result.length === 0) {
      // Return default config if none exists
      return res.json({
        id: 1,
        enabled: false,
        host: '127.0.0.1',
        port: 8094,
        schedulingMode: 'cache-first',
        sessionStickiness: true,
        allowedModels: '[]',
        apiKey: null,
      });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Failed to get proxy config:', error);
    res.status(500).json({ error: 'Failed to get proxy config' });
  }
});

// Update proxy configuration
router.put('/proxy', async (req, res) => {
  try {
    const { enabled, host, port, schedulingMode, sessionStickiness, allowedModels, apiKey } = req.body;

    const now = Date.now();

    // Check if config exists
    const existing = await db
      .select({ id: proxyConfig.id })
      .from(proxyConfig)
      .where(eq(proxyConfig.id, 1))
      .limit(1);

    if (existing.length === 0) {
      // Create new config
      await db.insert(proxyConfig).values({
        id: 1,
        enabled: enabled ?? false,
        host: host ?? '127.0.0.1',
        port: port ?? 8094,
        schedulingMode: schedulingMode ?? 'cache-first',
        sessionStickiness: sessionStickiness ?? true,
        allowedModels: typeof allowedModels === 'string' ? allowedModels : JSON.stringify(allowedModels ?? []),
        apiKey: apiKey ?? null,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      // Update existing config
      await db
        .update(proxyConfig)
        .set({
          enabled,
          host,
          port,
          schedulingMode,
          sessionStickiness,
          allowedModels: typeof allowedModels === 'string' ? allowedModels : JSON.stringify(allowedModels),
          apiKey,
          updatedAt: now,
        })
        .where(eq(proxyConfig.id, 1));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update proxy config:', error);
    res.status(500).json({ error: 'Failed to update proxy config' });
  }
});

export default router;
