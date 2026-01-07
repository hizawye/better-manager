// Provider management API endpoints

import { Router, Request, Response } from 'express';
import { providers, updateProviderConfig, ProviderConfig, DispatchMode } from '../config/settings.js';
import { testAnthropicConnection } from '../proxy/providers/anthropic.js';

const router = Router();

// Get all providers status
router.get('/', async (_req: Request, res: Response) => {
  res.json({
    providers: {
      anthropic: {
        enabled: providers.anthropic.enabled,
        dispatchMode: providers.anthropic.dispatchMode,
        hasApiKey: !!providers.anthropic.apiKey,
        baseUrl: providers.anthropic.baseUrl,
        modelMapping: providers.anthropic.modelMapping,
      },
    },
  });
});

// Get Anthropic provider status
router.get('/anthropic', async (_req: Request, res: Response) => {
  res.json({
    enabled: providers.anthropic.enabled,
    dispatchMode: providers.anthropic.dispatchMode,
    hasApiKey: !!providers.anthropic.apiKey,
    baseUrl: providers.anthropic.baseUrl,
    modelMapping: providers.anthropic.modelMapping,
  });
});

// Update Anthropic provider configuration
router.put('/anthropic', async (req: Request, res: Response) => {
  try {
    const { enabled, baseUrl, apiKey, dispatchMode, modelMapping } = req.body;

    const updates: Partial<ProviderConfig> = {};

    if (enabled !== undefined) {
      updates.enabled = Boolean(enabled);
    }

    if (baseUrl !== undefined) {
      updates.baseUrl = String(baseUrl);
    }

    if (apiKey !== undefined) {
      updates.apiKey = String(apiKey);
    }

    if (dispatchMode !== undefined) {
      if (!['off', 'always', 'fallback'].includes(dispatchMode)) {
        return res.status(400).json({ error: 'Invalid dispatch mode' });
      }
      updates.dispatchMode = dispatchMode as DispatchMode;
    }

    if (modelMapping !== undefined) {
      updates.modelMapping = modelMapping;
    }

    updateProviderConfig('anthropic', updates);

    res.json({
      success: true,
      config: {
        enabled: providers.anthropic.enabled,
        dispatchMode: providers.anthropic.dispatchMode,
        hasApiKey: !!providers.anthropic.apiKey,
        baseUrl: providers.anthropic.baseUrl,
        modelMapping: providers.anthropic.modelMapping,
      },
    });
  } catch (error) {
    console.error('Failed to update Anthropic provider:', error);
    res.status(500).json({ error: 'Failed to update provider configuration' });
  }
});

// Test Anthropic provider connection
router.post('/anthropic/test', async (_req: Request, res: Response) => {
  try {
    const result = await testAnthropicConnection();
    res.json(result);
  } catch (error) {
    console.error('Failed to test Anthropic connection:', error);
    res.status(500).json({
      success: false,
      message: String(error),
    });
  }
});

// Enable/disable Anthropic provider quickly
router.post('/anthropic/toggle', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    updateProviderConfig('anthropic', { enabled: Boolean(enabled) });
    res.json({
      success: true,
      enabled: providers.anthropic.enabled,
    });
  } catch (error) {
    console.error('Failed to toggle Anthropic provider:', error);
    res.status(500).json({ error: 'Failed to toggle provider' });
  }
});

export default router;
