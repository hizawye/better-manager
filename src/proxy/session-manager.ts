// Session Manager - Tracks session bindings and provides visibility
// Complements the token manager's session stickiness

export interface SessionBinding {
  sessionId: string;
  accountId: string;
  email: string;
  createdAt: number;
  lastUsedAt: number;
  requestCount: number;
}

export interface SessionStats {
  activeSessionCount: number;
  totalBindings: number;
  bindingsByAccount: Record<string, number>;
  avgSessionAge: number;
  avgRequestsPerSession: number;
}

class SessionManager {
  private bindings: Map<string, SessionBinding> = new Map();
  private sessionTTL: number = 60 * 60 * 1000; // 1 hour default

  /**
   * Record a session binding
   */
  recordBinding(sessionId: string, accountId: string, email: string): void {
    const existing = this.bindings.get(sessionId);
    
    if (existing) {
      existing.lastUsedAt = Date.now();
      existing.requestCount++;
      // Update account if changed
      if (existing.accountId !== accountId) {
        existing.accountId = accountId;
        existing.email = email;
      }
    } else {
      this.bindings.set(sessionId, {
        sessionId,
        accountId,
        email,
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        requestCount: 1,
      });
    }
  }

  /**
   * Get binding for a session
   */
  getBinding(sessionId: string): SessionBinding | undefined {
    return this.bindings.get(sessionId);
  }

  /**
   * Get all active bindings
   */
  getActiveBindings(): SessionBinding[] {
    this.cleanupExpired();
    return Array.from(this.bindings.values());
  }

  /**
   * Get bindings for a specific account
   */
  getBindingsForAccount(accountId: string): SessionBinding[] {
    return Array.from(this.bindings.values())
      .filter(b => b.accountId === accountId);
  }

  /**
   * Remove a session binding
   */
  removeBinding(sessionId: string): boolean {
    return this.bindings.delete(sessionId);
  }

  /**
   * Get session statistics
   */
  getStats(): SessionStats {
    this.cleanupExpired();
    
    const bindings = Array.from(this.bindings.values());
    const bindingsByAccount: Record<string, number> = {};
    
    let totalAge = 0;
    let totalRequests = 0;
    
    for (const binding of bindings) {
      bindingsByAccount[binding.accountId] = (bindingsByAccount[binding.accountId] || 0) + 1;
      totalAge += Date.now() - binding.createdAt;
      totalRequests += binding.requestCount;
    }
    
    return {
      activeSessionCount: bindings.length,
      totalBindings: bindings.length,
      bindingsByAccount,
      avgSessionAge: bindings.length > 0 ? totalAge / bindings.length : 0,
      avgRequestsPerSession: bindings.length > 0 ? totalRequests / bindings.length : 0,
    };
  }

  /**
   * Set session TTL
   */
  setTTL(ttlMs: number): void {
    this.sessionTTL = ttlMs;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpired(): number {
    const now = Date.now();
    const expiry = now - this.sessionTTL;
    let cleaned = 0;
    
    for (const [sessionId, binding] of this.bindings) {
      if (binding.lastUsedAt < expiry) {
        this.bindings.delete(sessionId);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Clear all bindings
   */
  clearAll(): void {
    this.bindings.clear();
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
