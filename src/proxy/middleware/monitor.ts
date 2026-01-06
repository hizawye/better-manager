// Request monitoring middleware

import { Request, Response, NextFunction } from 'express';
import { db } from '../../db/index.js';
import { proxyMonitorLogs } from '../../db/schema.js';

export interface MonitorLog {
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  accountEmail?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}

export function monitorMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Capture original end method
  const originalEnd = res.end.bind(res);

  res.end = function(chunk?: any, encoding?: any, callback?: any): Response {
    const latencyMs = Date.now() - startTime;

    // Log the request asynchronously
    const log: MonitorLog = {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      latencyMs,
    };

    // Try to extract model from request body
    if (req.body?.model) {
      log.model = req.body.model;
    }

    // Log to database (fire and forget)
    logRequest(log).catch(err => {
      console.error('Failed to log request:', err);
    });

    return originalEnd(chunk, encoding, callback);
  };

  next();
}

async function logRequest(log: MonitorLog): Promise<void> {
  await db.insert(proxyMonitorLogs).values({
    timestamp: Date.now(),
    method: log.method,
    path: log.path,
    statusCode: log.statusCode,
    latencyMs: log.latencyMs,
    accountEmail: log.accountEmail ?? null,
    model: log.model ?? null,
    inputTokens: log.inputTokens ?? null,
    outputTokens: log.outputTokens ?? null,
    errorMessage: log.errorMessage ?? null,
  });
}

export { logRequest };
