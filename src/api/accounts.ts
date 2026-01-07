import { Router } from 'express';
import { db } from '../db/index.js';
import { accounts, currentAccount } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { tokenManager } from '../proxy/token-manager.js';
import { upstreamClient, CloudCodeQuota } from '../proxy/upstream.js';
import { googleOAuth } from '../auth/google.js';

const router = Router();

// Cache for quota info (accountId -> quota)
const quotaCache = new Map<number, { quota: CloudCodeQuota; fetchedAt: number }>();
const QUOTA_CACHE_TTL = 60000; // 1 minute cache

/**
 * Fetch quota for an account, with caching
 */
async function getAccountQuota(accountId: number, accessToken: string, refreshToken: string): Promise<CloudCodeQuota | null> {
  // Check cache first
  const cached = quotaCache.get(accountId);
  if (cached && Date.now() - cached.fetchedAt < QUOTA_CACHE_TTL) {
    return cached.quota;
  }

  try {
    // Refresh token if needed
    let token = accessToken;
    const now = Date.now();

    // Try to fetch quota
    const quota = await upstreamClient.fetchQuota(token);

    // Cache the result
    quotaCache.set(accountId, { quota, fetchedAt: now });

    return quota;
  } catch (error) {
    console.error(`Failed to fetch quota for account ${accountId}:`, error);
    return null;
  }
}

// Get all accounts
router.get('/', async (req, res) => {
  try {
    const result = await db
      .select({
        id: accounts.id,
        email: accounts.email,
        displayName: accounts.displayName,
        photoUrl: accounts.photoUrl,
        isActive: accounts.isActive,
        sortOrder: accounts.sortOrder,
        expiresAt: accounts.expiresAt,
        accessToken: accounts.accessToken,
        refreshToken: accounts.refreshToken,
      })
      .from(accounts)
      .orderBy(asc(accounts.sortOrder));

    // Fetch quota for each account in parallel
    const accountsWithQuota = await Promise.all(
      result.map(async (account) => {
        const quota = await getAccountQuota(account.id, account.accessToken, account.refreshToken);

        return {
          id: account.id,
          email: account.email,
          displayName: account.displayName,
          photoUrl: account.photoUrl,
          is_forbidden: false, // Would be set based on rate limit status
          disabled_for_proxy: !account.isActive,
          subscription_tier: quota?.subscriptionTier ?? 'FREE',
          quota_info: quota ? {
            pro_quota: quota.proQuota,
            flash_quota: quota.flashQuota,
            image_quota: quota.imageQuota,
          } : undefined,
        };
      })
    );

    res.json(accountsWithQuota);
  } catch (error) {
    console.error('Failed to get accounts:', error);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// Get current account
router.get('/current', async (req, res) => {
  try {
    const result = await db
      .select({
        id: accounts.id,
        email: accounts.email,
        displayName: accounts.displayName,
        photoUrl: accounts.photoUrl,
        isActive: accounts.isActive,
      })
      .from(currentAccount)
      .leftJoin(accounts, eq(currentAccount.accountId, accounts.id))
      .limit(1);

    res.json(result[0] || null);
  } catch (error) {
    console.error('Failed to get current account:', error);
    res.status(500).json({ error: 'Failed to get current account' });
  }
});

// Get account by ID
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await db
      .select({
        id: accounts.id,
        email: accounts.email,
        displayName: accounts.displayName,
        photoUrl: accounts.photoUrl,
        isActive: accounts.isActive,
        sortOrder: accounts.sortOrder,
        expiresAt: accounts.expiresAt,
      })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(result[0]);
  } catch (error) {
    console.error('Failed to get account:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// Delete account
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await db.delete(accounts).where(eq(accounts.id, id));
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Toggle account active status
router.put('/:id/toggle', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Get current status
    const current = await db
      .select({ isActive: accounts.isActive })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);

    if (current.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const newStatus = !current[0].isActive;

    await db
      .update(accounts)
      .set({ isActive: newStatus, updatedAt: Date.now() })
      .where(eq(accounts.id, id));

    res.json({ isActive: newStatus });
  } catch (error) {
    console.error('Failed to toggle account:', error);
    res.status(500).json({ error: 'Failed to toggle account' });
  }
});

// Set current account
router.post('/:id/current', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Verify account exists
    const account = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);

    if (account.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Update current account
    await db
      .update(currentAccount)
      .set({ accountId: id })
      .where(eq(currentAccount.id, 1));

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to set current account:', error);
    res.status(500).json({ error: 'Failed to set current account' });
  }
});

// Refresh all accounts (reload tokens)
router.post('/refresh', async (_req, res) => {
  try {
    const count = await tokenManager.loadAccounts();
    res.json({ success: true, accountsLoaded: count });
  } catch (error) {
    console.error('Failed to refresh accounts:', error);
    res.status(500).json({ error: 'Failed to refresh accounts' });
  }
});

// Refresh quota for a specific account
router.post('/:id/refresh-quota', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    // Get account details
    const account = await db
      .select({
        email: accounts.email,
        accessToken: accounts.accessToken,
        refreshToken: accounts.refreshToken,
      })
      .from(accounts)
      .where(eq(accounts.id, id))
      .limit(1);

    if (account.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Clear cache for this account to force refresh
    quotaCache.delete(id);

    // Fetch fresh quota
    const quota = await getAccountQuota(id, account[0].accessToken, account[0].refreshToken);

    res.json({
      success: true,
      message: 'Quota refreshed',
      quota_info: quota ? {
        pro_quota: quota.proQuota,
        flash_quota: quota.flashQuota,
        image_quota: quota.imageQuota,
      } : undefined,
    });
  } catch (error) {
    console.error('Failed to refresh quota:', error);
    res.status(500).json({ error: 'Failed to refresh quota' });
  }
});

export default router;
