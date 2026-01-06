import { Router } from 'express';
import { db } from '../db/index.js';
import { accounts } from '../db/schema.js';
import { GoogleOAuth, googleOAuth } from './google.js';
import { eq } from 'drizzle-orm';
import open from 'open';

const router = Router();

// Store pending OAuth states (in production, use Redis or similar)
const pendingStates = new Map<string, { timestamp: number }>();

// Clean up old states (older than 10 minutes)
function cleanupStates() {
  const now = Date.now();
  const tenMinutes = 10 * 60 * 1000;
  for (const [state, data] of pendingStates) {
    if (now - data.timestamp > tenMinutes) {
      pendingStates.delete(state);
    }
  }
}

// Start OAuth flow
router.get('/start', async (req, res) => {
  try {
    if (!googleOAuth.isConfigured()) {
      return res.status(400).json({
        error: 'OAuth not configured',
        message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables',
      });
    }

    cleanupStates();

    const state = GoogleOAuth.generateState();
    pendingStates.set(state, { timestamp: Date.now() });

    const authUrl = googleOAuth.generateAuthUrl(state);

    // Try to open browser
    try {
      await open(authUrl);
      res.json({ message: 'Browser opened for authentication', authUrl });
    } catch {
      res.json({ message: 'Please open this URL in your browser', authUrl });
    }
  } catch (error) {
    console.error('Failed to start OAuth flow:', error);
    res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
});

// OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>You can close this window.</p>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      return res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>Invalid Request</h1>
            <p>Missing authorization code or state.</p>
          </body>
        </html>
      `);
    }

    // Verify state
    if (!pendingStates.has(state as string)) {
      return res.status(400).send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>Invalid State</h1>
            <p>The authentication request has expired or is invalid.</p>
          </body>
        </html>
      `);
    }

    pendingStates.delete(state as string);

    // Exchange code for tokens
    const tokens = await googleOAuth.exchangeCode(code as string);

    // Get user info
    const userInfo = await googleOAuth.getUserInfo(tokens.access_token);

    const now = Date.now();
    const expiresAt = now + tokens.expires_in * 1000;

    // Check if account already exists
    const existing = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.email, userInfo.email))
      .limit(1);

    if (existing.length > 0) {
      // Update existing account
      await db
        .update(accounts)
        .set({
          displayName: userInfo.name,
          photoUrl: userInfo.picture,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || '',
          expiresAt,
          updatedAt: now,
        })
        .where(eq(accounts.id, existing[0].id));
    } else {
      // Create new account
      await db.insert(accounts).values({
        email: userInfo.email,
        displayName: userInfo.name,
        photoUrl: userInfo.picture,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || '',
        expiresAt,
        isActive: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>✓ Authentication Successful</h1>
          <p>Welcome, ${userInfo.name || userInfo.email}!</p>
          <p>You can close this window and return to the application.</p>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>Authentication Error</h1>
          <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
        </body>
      </html>
    `);
  }
});

// Check OAuth configuration status
router.get('/status', (req, res) => {
  res.json({
    configured: googleOAuth.isConfigured(),
    hasClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    hasClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
  });
});

export default router;
