import { Router } from 'express';
import { db } from '../db/index.js';
import { accounts, currentAccount } from '../db/schema.js';
import { eq, asc } from 'drizzle-orm';

const router = Router();

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
      })
      .from(accounts)
      .orderBy(asc(accounts.sortOrder));

    res.json(result);
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

export default router;
