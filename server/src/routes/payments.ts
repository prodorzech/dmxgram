import express, { Router } from 'express';
import Stripe from 'stripe';
import { db } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validateBoostCode, redeemBoostCode, undoRedeemBoostCode } from '../utils/boostCodes';

const router: Router = express.Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  return new Stripe(key, { apiVersion: '2024-06-20' as any });
}

// POST /api/payments/create-checkout  (monthly subscription)
router.post('/create-checkout', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const stripe = getStripe();
    const baseUrl = `http://localhost:3001`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'DMX Boost',
              description: 'Monthly subscription — unlock banner, accent colors & premium badge',
            },
            unit_amount: 499, // $4.99/month
            recurring: { interval: 'month' },
          },
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${baseUrl}/api/payments/success?session_id={CHECKOUT_SESSION_ID}&user_id=${userId}`,
      cancel_url:  `${baseUrl}/api/payments/cancel`,
      metadata: { userId },
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: err.message || 'Payment error' });
  }
});

// GET /api/payments/success?session_id=xxx&user_id=xxx
router.get('/success', async (req, res) => {
  try {
    const { session_id, user_id } = req.query as { session_id?: string; user_id?: string };
    if (!session_id || !user_id) {
      return res.status(400).send(htmlPage('Error', '❌ Missing parameters.', '#ef4444'));
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // For subscriptions: payment_status is 'paid' when first invoice succeeds
    // For one-time payments it was also 'paid'
    const isPaid = session.payment_status === 'paid' ||
                   session.status === 'complete';
    if (!isPaid) {
      return res.status(400).send(htmlPage('Payment Pending', '⏳ Payment not confirmed yet.', '#f59e0b'));
    }

    // Fetch current user to get existing badges
    const currentUser = await db.getUserById(user_id);
    const existingBadges: string[] = currentUser?.badges || [];
    const newBadges = existingBadges.includes('dmx-boost') ? existingBadges : [...existingBadges, 'dmx-boost'];

    // Set expiry 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Mark user as boosted, grant badge, set expiry
    await db.updateUser(user_id, {
      hasDmxBoost: true,
      dmxBoostExpiresAt: expiresAt,
      badges: newBadges,
    } as any);

    res.send(htmlPage(
      'DMX Boost Activated! 🚀',
      `✅ Your DMX Boost is now active until <strong>${expiresAt.toLocaleDateString('en-GB')}</strong>!<br><br>Return to the app and enjoy your perks.`,
      '#22c55e',
    ));
  } catch (err: any) {
    console.error('Boost activation error:', err);
    res.status(500).send(htmlPage('Error', `❌ ${err.message}`, '#ef4444'));
  }
});

// GET /api/payments/cancel
router.get('/cancel', (_req, res) => {
  res.send(htmlPage('Cancelled', '🙁 Purchase was cancelled. You can try again from the app.', '#6b7280'));
});

// POST /api/payments/redeem-code  — redeem an admin-issued boost code
router.post('/redeem-code', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { code } = req.body as { code?: string };
    if (!code) return res.status(400).json({ error: 'Code is required' });

    const entry = await validateBoostCode(code);
    if (!entry) return res.status(400).json({ error: 'invalidCode' });

    const currentUser = await db.getUserById(userId);
    if (!currentUser) return res.status(404).json({ error: 'User not found' });

    const ok = await redeemBoostCode(code, userId, currentUser.username);
    if (!ok) return res.status(400).json({ error: 'alreadyUsed' });

    // Grant boost: extend if already active, otherwise start from now
    const base = currentUser.hasDmxBoost && currentUser.dmxBoostExpiresAt
      ? new Date(currentUser.dmxBoostExpiresAt)
      : new Date();
    base.setDate(base.getDate() + entry.durationDays);

    const existingBadges: string[] = currentUser.badges || [];
    const newBadges = existingBadges.includes('dmx-boost')
      ? existingBadges
      : [...existingBadges, 'dmx-boost'];

    try {
      await db.updateUser(userId, {
        hasDmxBoost: true,
        dmxBoostExpiresAt: base,
        badges: newBadges,
      } as any);
    } catch (updateErr: any) {
      // Rollback: restore the code usage so it can be retried after the schema is fixed
      await undoRedeemBoostCode(code, userId);
      console.error('updateUser failed during redeem, rolled back code usage:', updateErr);
      return res.status(400).json({ error: updateErr.message || 'missingBoostColumns' });
    }

    const updatedUser = await db.getUserById(userId);
    res.json({
      success: true,
      durationDays: entry.durationDays,
      expiresAt: base.toISOString(),
      user: updatedUser,
    });
  } catch (err: any) {
    console.error('Redeem code error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

function htmlPage(title: string, message: string, color: string): string {
  return `<!DOCTYPE html><html>
<head><meta charset="utf-8"><title>${title} — DMXGram</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#0f0f0f;color:#fff;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{background:#1a1a1a;border:2px solid ${color};border-radius:16px;padding:48px 40px;text-align:center;max-width:420px;width:90%}
  h1{color:${color};font-size:28px;margin-bottom:16px}
  p{color:#ccc;font-size:16px;line-height:1.6}
  .brand{color:#dc2626;font-weight:900;font-size:22px;margin-bottom:28px}
</style></head>
<body><div class="card">
  <div class="brand">DMXGram</div>
  <h1>${title}</h1>
  <p>${message}</p>
</div></body></html>`;
}

export default router;
