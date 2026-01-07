// Model mappings API endpoints

import { Router, Request, Response } from 'express';
import { modelMappings } from '../config/settings.js';

const router = Router();

// Available target models for the dropdown
const AVAILABLE_TARGETS = [
  'claude-opus-4-5-thinking',
  'claude-sonnet-4-5-thinking',
  'claude-sonnet-4-5',
  'gemini-3-pro-high',
  'gemini-3-pro-low',
  'gemini-3-pro-image',
];

// GET /api/mappings - list all mappings
router.get('/', (_req: Request, res: Response) => {
  res.json({
    builtIn: {
      anthropic: modelMappings.anthropic,
      openai: modelMappings.openai,
    },
    custom: modelMappings.custom,
    availableTargets: AVAILABLE_TARGETS,
  });
});

// POST /api/mappings - add/update a custom mapping
router.post('/', (req: Request, res: Response) => {
  const { from, to } = req.body;
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to are required' });
  }
  if (typeof from !== 'string' || typeof to !== 'string') {
    return res.status(400).json({ error: 'from and to must be strings' });
  }
  modelMappings.custom[from] = to;
  res.json({ success: true, mappings: modelMappings.custom });
});

// DELETE /api/mappings/:from - delete a custom mapping
router.delete('/:from', (req: Request, res: Response) => {
  const from = decodeURIComponent(req.params.from);
  if (!modelMappings.custom[from]) {
    return res.status(404).json({ error: 'Mapping not found' });
  }
  delete modelMappings.custom[from];
  res.json({ success: true, mappings: modelMappings.custom });
});

export default router;
