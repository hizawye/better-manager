// Authentication middleware

import { Request, Response, NextFunction } from 'express';
import { db } from '../../db/index.js';
import { proxyConfig } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

let cachedApiKey: string | null = null;
let cacheExpiry = 0;

async function getApiKey(): Promise<string | null> {
  const now = Date.now();
  if (cachedApiKey !== null && now < cacheExpiry) {
    return cachedApiKey;
  }

  const result = await db
    .select({ apiKey: proxyConfig.apiKey })
    .from(proxyConfig)
    .where(eq(proxyConfig.id, 1))
    .limit(1);

  cachedApiKey = result[0]?.apiKey ?? null;
  cacheExpiry = now + 60000; // Cache for 1 minute
  return cachedApiKey;
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = await getApiKey();

  // If no API key is configured, allow all requests
  if (!apiKey) {
    return next();
  }

  // Extract Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  // Support both 'Bearer <key>' and 'x-api-key' formats
  let providedKey = '';
  if (authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7);
  } else {
    providedKey = authHeader;
  }

  // Also check x-api-key header (used by some clients)
  if (!providedKey) {
    providedKey = req.headers['x-api-key'] as string || '';
  }

  if (providedKey !== apiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}

export function clearAuthCache(): void {
  cachedApiKey = null;
  cacheExpiry = 0;
}
