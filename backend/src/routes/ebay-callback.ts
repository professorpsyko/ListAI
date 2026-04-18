/**
 * Public GET /api/ebay/callback
 *
 * eBay redirects here after the user approves the OAuth request.
 * No Clerk auth — the user's identity comes from the `state` param (their DB userId).
 */
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { exchangeCodeForTokens } from '../services/ebay-oauth';
import { config } from '../config';

const router = Router();

router.get('/callback', async (req: Request, res: Response) => {
  const { code, state: userId, error, error_description } = req.query as Record<string, string>;

  const frontendBase = config.FRONTEND_URL;

  // eBay sent an error (user denied, etc.)
  if (error || !code) {
    const msg = encodeURIComponent(error_description ?? error ?? 'Authorization denied');
    return res.redirect(`${frontendBase}/settings?ebay=error&message=${msg}`);
  }

  if (!userId) {
    return res.redirect(`${frontendBase}/settings?ebay=error&message=Missing+state+parameter`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);

    await prisma.user.update({
      where: { id: userId },
      data: {
        ebayAccessToken: tokens.accessToken,
        ebayRefreshToken: tokens.refreshToken,
        ebayTokenExpiry: tokens.expiresAt,
      },
    });

    console.log(`[eBay OAuth] ✓ Connected for user ${userId}, token expires ${tokens.expiresAt.toISOString()}`);
    return res.redirect(`${frontendBase}/settings?ebay=connected`);
  } catch (err) {
    console.error('[eBay OAuth] Token exchange failed:', (err as Error).message);
    const msg = encodeURIComponent('Failed to connect eBay account. Please try again.');
    return res.redirect(`${frontendBase}/settings?ebay=error&message=${msg}`);
  }
});

export default router;
