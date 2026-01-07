// Rate limit tracking and management module
// Provides visibility into rate limit status across all accounts

import { RateLimitInfo, RateLimitReason } from './types.js';

export interface RateLimitEvent {
  accountId: string;
  timestamp: number;
  status: number;
  reason: RateLimitReason;
  retryAfter: number;
  errorBody?: string;
}

export interface RateLimitStats {
  totalEvents: number;
  eventsByReason: Record<RateLimitReason, number>;
  eventsByAccount: Record<string, number>;
  last24Hours: number;
  lastHour: number;
}

class RateLimiter {
  private events: RateLimitEvent[] = [];
  private maxEvents = 1000; // Keep last 1000 events

  /**
   * Record a rate limit event
   */
  recordEvent(
    accountId: string,
    status: number,
    reason: RateLimitReason,
    retryAfter: number,
    errorBody?: string
  ): void {
    const event: RateLimitEvent = {
      accountId,
      timestamp: Date.now(),
      status,
      reason,
      retryAfter,
      errorBody: errorBody?.substring(0, 500), // Truncate long error bodies
    };

    this.events.push(event);

    // Trim old events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /**
   * Get recent rate limit events
   */
  getRecentEvents(limit: number = 50): RateLimitEvent[] {
    return this.events.slice(-limit).reverse();
  }

  /**
   * Get events for a specific account
   */
  getEventsForAccount(accountId: string, limit: number = 50): RateLimitEvent[] {
    return this.events
      .filter(e => e.accountId === accountId)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get rate limit statistics
   */
  getStats(): RateLimitStats {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const eventsByReason: Record<string, number> = {};
    const eventsByAccount: Record<string, number> = {};
    let lastHour = 0;
    let last24Hours = 0;

    for (const event of this.events) {
      // Count by reason
      eventsByReason[event.reason] = (eventsByReason[event.reason] || 0) + 1;

      // Count by account
      eventsByAccount[event.accountId] = (eventsByAccount[event.accountId] || 0) + 1;

      // Count by time
      if (event.timestamp >= hourAgo) {
        lastHour++;
      }
      if (event.timestamp >= dayAgo) {
        last24Hours++;
      }
    }

    return {
      totalEvents: this.events.length,
      eventsByReason: eventsByReason as Record<RateLimitReason, number>,
      eventsByAccount,
      last24Hours,
      lastHour,
    };
  }

  /**
   * Clear all events
   */
  clearEvents(): void {
    this.events = [];
  }

  /**
   * Calculate optimal backoff based on recent events
   */
  calculateBackoff(accountId: string, baseDelay: number = 1000): number {
    const recentEvents = this.events.filter(
      e => e.accountId === accountId && e.timestamp > Date.now() - 5 * 60 * 1000
    );

    if (recentEvents.length === 0) {
      return baseDelay;
    }

    // Exponential backoff based on recent failures
    const factor = Math.min(recentEvents.length, 5);
    return baseDelay * Math.pow(2, factor);
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
