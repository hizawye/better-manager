// Token Manager - Manages account pool with rate limiting and session stickiness

import { db } from '../db/index.js';
import { accounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { googleOAuth } from '../auth/google.js';
import { upstreamClient } from './upstream.js';
import {
  ProxyToken,
  RateLimitInfo,
  RateLimitReason,
  SchedulingMode,
  StickySessionConfig,
} from './types.js';

export class TokenManager {
  private tokens: Map<string, ProxyToken> = new Map();
  private currentIndex = 0;
  private lastUsedAccount: { accountId: string; timestamp: number } | null = null;
  private rateLimits: Map<string, RateLimitInfo> = new Map();
  private sessionAccounts: Map<string, string> = new Map(); // sessionId -> accountId
  private stickyConfig: StickySessionConfig = {
    mode: SchedulingMode.CacheFirst,
    maxWaitSeconds: 60,
  };

  constructor() {}

  /**
   * Load all active accounts from database
   */
  async loadAccounts(): Promise<number> {
    this.tokens.clear();
    this.currentIndex = 0;
    this.lastUsedAccount = null;

    const dbAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.isActive, true));

    for (const account of dbAccounts) {
      const token: ProxyToken = {
        accountId: String(account.id),
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: account.expiresAt,
        email: account.email,
        subscriptionTier: undefined, // Could be stored in DB if needed
      };
      this.tokens.set(token.accountId, token);
    }

    return this.tokens.size;
  }

  /**
   * Get a token from the pool with smart scheduling
   */
  async getToken(
    quotaGroup: string,
    forceRotate: boolean,
    sessionId?: string
  ): Promise<{ accessToken: string; projectId: string; email: string }> {
    const tokensArray = Array.from(this.tokens.values());
    const total = tokensArray.length;

    if (total === 0) {
      throw new Error('Token pool is empty');
    }

    // Sort by subscription tier (ULTRA > PRO > FREE)
    tokensArray.sort((a, b) => {
      const tierPriority = (tier?: string) => {
        switch (tier) {
          case 'ULTRA': return 0;
          case 'PRO': return 1;
          case 'FREE': return 2;
          default: return 3;
        }
      };
      return tierPriority(a.subscriptionTier) - tierPriority(b.subscriptionTier);
    });

    const attempted = new Set<string>();
    let lastError: string | null = null;

    for (let attempt = 0; attempt < total; attempt++) {
      const rotate = forceRotate || attempt > 0;
      let targetToken: ProxyToken | null = null;

      // Mode A: Sticky session handling
      if (!rotate && sessionId && this.stickyConfig.mode !== SchedulingMode.PerformanceFirst) {
        const boundId = this.sessionAccounts.get(sessionId);
        if (boundId) {
          const resetSec = this.getRemainingWait(boundId);
          if (resetSec > 0) {
            if (this.stickyConfig.mode === SchedulingMode.CacheFirst && resetSec <= this.stickyConfig.maxWaitSeconds) {
              // Wait for rate limit to clear
              console.log(`Cache-first: Session ${sessionId} waiting ${resetSec}s for account ${boundId}`);
              await this.sleep(resetSec * 1000);
              const found = tokensArray.find(t => t.accountId === boundId);
              if (found) targetToken = found;
            } else {
              // Remove binding and rotate
              this.sessionAccounts.delete(sessionId);
            }
          } else if (!attempted.has(boundId)) {
            const found = tokensArray.find(t => t.accountId === boundId);
            if (found) targetToken = found;
          }
        }
      }

      // Mode B: 60s global lock (default protection)
      if (!targetToken && !rotate && quotaGroup !== 'image_gen') {
        if (this.lastUsedAccount && !attempted.has(this.lastUsedAccount.accountId)) {
          const elapsed = Date.now() - this.lastUsedAccount.timestamp;
          if (elapsed < 60000) {
            const found = tokensArray.find(t => t.accountId === this.lastUsedAccount!.accountId);
            if (found && !this.isRateLimited(found.accountId)) {
              targetToken = found;
            }
          }
        }

        if (!targetToken) {
          // Round-robin selection
          for (let offset = 0; offset < total; offset++) {
            const idx = (this.currentIndex + offset) % total;
            const candidate = tokensArray[idx];
            if (attempted.has(candidate.accountId) || this.isRateLimited(candidate.accountId)) {
              continue;
            }
            targetToken = candidate;
            this.currentIndex = (idx + 1) % total;
            this.lastUsedAccount = { accountId: candidate.accountId, timestamp: Date.now() };

            // Bind to session if applicable
            if (sessionId && this.stickyConfig.mode !== SchedulingMode.PerformanceFirst) {
              this.sessionAccounts.set(sessionId, candidate.accountId);
            }
            break;
          }
        }
      } else if (!targetToken) {
        // Mode C: Pure round-robin or force rotate
        for (let offset = 0; offset < total; offset++) {
          const idx = (this.currentIndex + offset) % total;
          const candidate = tokensArray[idx];
          if (attempted.has(candidate.accountId) || this.isRateLimited(candidate.accountId)) {
            continue;
          }
          targetToken = candidate;
          this.currentIndex = (idx + 1) % total;
          break;
        }
      }

      if (!targetToken) {
        // All accounts rate-limited
        const minWait = Math.min(
          ...tokensArray.map(t => this.getResetSeconds(t.accountId) ?? 60)
        );
        throw new Error(`All accounts are currently limited. Please wait ${minWait}s.`);
      }

      // Check if token is expired (refresh 5 min before expiry)
      const now = Date.now();
      if (now >= targetToken.expiresAt - 5 * 60 * 1000) {
        console.log(`Token for ${targetToken.email} is expiring, refreshing...`);
        try {
          const tokenResponse = await googleOAuth.refreshToken(targetToken.refreshToken);
          targetToken.accessToken = tokenResponse.access_token;
          targetToken.expiresAt = now + tokenResponse.expires_in * 1000;

          // Update in memory
          this.tokens.set(targetToken.accountId, targetToken);

          // Update in database
          await db
            .update(accounts)
            .set({
              accessToken: tokenResponse.access_token,
              expiresAt: targetToken.expiresAt,
              updatedAt: now,
            })
            .where(eq(accounts.id, parseInt(targetToken.accountId, 10)));
        } catch (err) {
          console.error(`Token refresh failed for ${targetToken.email}:`, err);
          lastError = `Token refresh failed: ${err}`;
          attempted.add(targetToken.accountId);

          // Clear lock if this account was locked
          if (this.lastUsedAccount?.accountId === targetToken.accountId) {
            this.lastUsedAccount = null;
          }
          continue;
        }
      }

      // Fetch project_id if not cached
      if (!targetToken.projectId) {
        console.log(`Fetching project_id for ${targetToken.email}...`);
        try {
          const projectId = await upstreamClient.fetchProjectId(targetToken.accessToken);
          targetToken.projectId = projectId;
          this.tokens.set(targetToken.accountId, targetToken);
          console.log(`Got project_id for ${targetToken.email}: ${projectId}`);
        } catch (err) {
          console.warn(`Failed to fetch project_id for ${targetToken.email}:`, err);
          // Use fallback project_id
          targetToken.projectId = `fallback-${Date.now()}`;
        }
      }

      return {
        accessToken: targetToken.accessToken,
        projectId: targetToken.projectId!,
        email: targetToken.email,
      };
    }

    throw new Error(lastError ?? 'All accounts failed');
  }

  /**
   * Mark an account as rate limited
   */
  markRateLimited(
    accountId: string,
    status: number,
    retryAfterHeader?: string,
    errorBody?: string
  ): void {
    let reason = RateLimitReason.RateLimitExceeded;
    let retryAfter = 60; // Default 60 seconds

    // Parse retry-after header
    if (retryAfterHeader) {
      const parsed = parseInt(retryAfterHeader, 10);
      if (!isNaN(parsed)) {
        retryAfter = parsed;
      }
    }

    // Determine reason from status and body
    if (status === 403) {
      reason = RateLimitReason.AccountForbidden;
      retryAfter = 3600; // 1 hour for forbidden
    } else if (status >= 500) {
      reason = RateLimitReason.ServerError;
      retryAfter = 30;
    } else if (errorBody?.includes('QUOTA_EXHAUSTED')) {
      reason = RateLimitReason.QuotaExhausted;
      // Try to parse quota reset delay from error body
      const match = errorBody.match(/quotaResetDelay[\":]?\s*[\"']?(\d+h)?(\d+m)?(\d+s)?/i);
      if (match) {
        const hours = parseInt(match[1] ?? '0', 10) || 0;
        const mins = parseInt(match[2] ?? '0', 10) || 0;
        const secs = parseInt(match[3] ?? '0', 10) || 0;
        retryAfter = hours * 3600 + mins * 60 + secs;
      } else {
        retryAfter = 3600; // Default 1 hour for quota
      }
    }

    const info: RateLimitInfo = {
      until: Date.now() + retryAfter * 1000,
      reason,
      retryAfter,
    };

    this.rateLimits.set(accountId, info);
    console.log(`Account ${accountId} rate-limited for ${retryAfter}s (${reason})`);
  }

  /**
   * Check if an account is currently rate limited
   */
  isRateLimited(accountId: string): boolean {
    const info = this.rateLimits.get(accountId);
    if (!info) return false;
    if (Date.now() >= info.until) {
      this.rateLimits.delete(accountId);
      return false;
    }
    return true;
  }

  /**
   * Get remaining wait time for a rate-limited account
   */
  getRemainingWait(accountId: string): number {
    const info = this.rateLimits.get(accountId);
    if (!info) return 0;
    const remaining = Math.ceil((info.until - Date.now()) / 1000);
    return Math.max(0, remaining);
  }

  /**
   * Get seconds until rate limit resets
   */
  getResetSeconds(accountId: string): number | null {
    const info = this.rateLimits.get(accountId);
    if (!info) return null;
    return Math.max(0, Math.ceil((info.until - Date.now()) / 1000));
  }

  /**
   * Update scheduling configuration
   */
  updateStickyConfig(config: Partial<StickySessionConfig>): void {
    this.stickyConfig = { ...this.stickyConfig, ...config };
  }

  /**
   * Get current scheduling configuration
   */
  getStickyConfig(): StickySessionConfig {
    return { ...this.stickyConfig };
  }

  /**
   * Clear all session bindings
   */
  clearAllSessions(): void {
    this.sessionAccounts.clear();
  }

  /**
   * Get pool size
   */
  size(): number {
    return this.tokens.size;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const tokenManager = new TokenManager();
