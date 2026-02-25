import express, { Router } from 'express';
import Stripe from 'stripe';
import crypto from 'crypto';
import { db, getSupabase } from '../database';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { validateBoostCode, redeemBoostCode, undoRedeemBoostCode } from '../utils/boostCodes';

const router: Router = express.Router();

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG & HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

const PLANS: Record<string, { label: string; days: number; priceUsd: number }> = {
  '1month':   { label: '1month',   days: 30,  priceUsd: 4.99 },
  '3months':  { label: '3months',  days: 90,  priceUsd: 12.99 },
  '12months': { label: '12months', days: 365, priceUsd: 39.99 },
};

// Your crypto wallet addresses — set via environment variables
const CRYPTO_WALLETS: Record<string, string> = {
  btc:  process.env.CRYPTO_WALLET_BTC  || '',
  ltc:  process.env.CRYPTO_WALLET_LTC  || '',
  eth:  process.env.CRYPTO_WALLET_ETH  || '',
  usdt: process.env.CRYPTO_WALLET_USDT || '',   // ERC-20 same as ETH address
};

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: '2024-06-20' as any });
}

function generatePaymentRef(): string {
  return 'DMX-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

/** Fetch crypto price in USD from CoinGecko */
async function getCryptoPrice(coin: 'bitcoin' | 'litecoin' | 'ethereum' | 'tether'): Promise<number> {
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`);
    const data: any = await res.json();
    return data[coin]?.usd || 0;
  } catch {
    return 0;
  }
}

const COIN_MAP: Record<string, 'bitcoin' | 'litecoin' | 'ethereum' | 'tether'> = {
  btc: 'bitcoin', ltc: 'litecoin', eth: 'ethereum', usdt: 'tether',
};

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/payments/plans
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/plans', (_req, res) => {
  const methods: string[] = [];
  if (CRYPTO_WALLETS.btc)  methods.push('btc');
  if (CRYPTO_WALLETS.ltc)  methods.push('ltc');
  if (CRYPTO_WALLETS.eth)  methods.push('eth');
  if (CRYPTO_WALLETS.usdt) methods.push('usdt');
  if (getStripe())         { methods.push('card'); methods.push('paypal'); }

  res.json({ plans: PLANS, methods });
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/payments/create
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/create', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const { plan, method } = req.body as { plan?: string; method?: string };

    if (!plan || !PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
    if (!method) return res.status(400).json({ error: 'Invalid method' });

    const planInfo = PLANS[plan];

    // ── CARD / PAYPAL via Stripe ──
    if (method === 'card' || method === 'paypal') {
      const stripe = getStripe();
      if (!stripe) return res.status(500).json({ error: 'Płatności kartą nie są skonfigurowane' });

      const paymentMethodTypes: string[] = method === 'paypal' ? ['paypal'] : ['card'];
      const baseUrl = `http://localhost:3001`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: paymentMethodTypes as any,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `DMX Boost — ${planInfo.label}`,
              description: `DMX Boost na ${planInfo.days} dni`,
            },
            unit_amount: Math.round(planInfo.priceUsd * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/api/payments/success?session_id={CHECKOUT_SESSION_ID}&user_id=${userId}`,
        cancel_url: `${baseUrl}/api/payments/cancel`,
        metadata: { userId, plan, boostDays: planInfo.days.toString() },
      });

      const supabase = getSupabase();
      await supabase.from('payments').insert({
        user_id: userId,
        plan,
        amount_usd: planInfo.priceUsd,
        method,
        status: 'pending',
        stripe_session_id: session.id,
        boost_days: planInfo.days,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });

      return res.json({ type: 'redirect', url: session.url });
    }

    // ── CRYPTO ──
    if (['btc', 'ltc', 'eth', 'usdt'].includes(method)) {
      const wallet = CRYPTO_WALLETS[method];
      if (!wallet) return res.status(400).json({ error: `${method.toUpperCase()} nie skonfigurowany` });

      const coinId = COIN_MAP[method];
      let cryptoAmount: string;

      if (method === 'usdt') {
        cryptoAmount = planInfo.priceUsd.toFixed(2);
      } else {
        const priceUsd = await getCryptoPrice(coinId);
        if (!priceUsd) return res.status(500).json({ error: 'Nie można pobrać ceny kryptowaluty' });
        cryptoAmount = (planInfo.priceUsd / priceUsd).toFixed(8);
      }

      const paymentRef = generatePaymentRef();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

      const supabase = getSupabase();
      const { data: payment, error: insertErr } = await supabase.from('payments').insert({
        user_id: userId,
        plan,
        amount_usd: planInfo.priceUsd,
        method,
        status: 'pending',
        crypto_address: wallet,
        crypto_amount: cryptoAmount,
        boost_days: planInfo.days,
        expires_at: expiresAt.toISOString(),
      }).select().single();

      if (insertErr) {
        console.error('Payment insert error:', insertErr);
        return res.status(500).json({ error: 'Nie udało się utworzyć płatności' });
      }

      return res.json({
        type: 'crypto',
        paymentId: payment.id,
        address: wallet,
        amount: cryptoAmount,
        currency: method.toUpperCase(),
        ref: paymentRef,
        expiresAt: expiresAt.toISOString(),
      });
    }

    return res.status(400).json({ error: 'Nieznana metoda płatności' });
  } catch (err: any) {
    console.error('Payment create error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/payments/status/:id
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/status/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const supabase = getSupabase();
    const { data: payment } = await supabase.from('payments')
      .select('*').eq('id', req.params.id).eq('user_id', req.userId!).single();

    if (!payment) return res.status(404).json({ error: 'Płatność nie znaleziona' });

    if (payment.status === 'pending' && payment.expires_at && new Date(payment.expires_at) < new Date()) {
      await supabase.from('payments').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', payment.id);
      return res.json({ ...payment, status: 'expired' });
    }

    res.json(payment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/payments/verify-crypto/:id
   ═══════════════════════════════════════════════════════════════════════════ */
router.post('/verify-crypto/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const supabase = getSupabase();
    const { data: payment } = await supabase.from('payments')
      .select('*').eq('id', req.params.id).eq('user_id', req.userId!).single();

    if (!payment) return res.status(404).json({ error: 'Płatność nie znaleziona' });
    if (payment.status === 'confirmed') return res.json({ status: 'confirmed', message: 'Już potwierdzone' });
    if (payment.status === 'expired') return res.status(400).json({ error: 'Płatność wygasła' });

    const method = payment.method;
    const address = payment.crypto_address;
    const expectedAmount = parseFloat(payment.crypto_amount);
    let confirmed = false;
    let txHash = '';

    // ── BTC / LTC via Blockcypher ──
    if (method === 'btc' || method === 'ltc') {
      const chain = method === 'btc' ? 'btc/main' : 'ltc/main';
      try {
        const apiRes = await fetch(`https://api.blockcypher.com/v1/${chain}/addrs/${address}?limit=5`);
        const data: any = await apiRes.json();
        if (data.txrefs) {
          for (const tx of data.txrefs) {
            const valueCoin = tx.value / 1e8;
            if (valueCoin >= expectedAmount * 0.98) {
              confirmed = true; txHash = tx.tx_hash; break;
            }
          }
        }
        if (!confirmed && data.unconfirmed_txrefs) {
          for (const tx of data.unconfirmed_txrefs) {
            const valueCoin = tx.value / 1e8;
            if (valueCoin >= expectedAmount * 0.98) {
              await supabase.from('payments').update({
                status: 'confirming', crypto_tx_hash: tx.tx_hash, updated_at: new Date().toISOString(),
              }).eq('id', payment.id);
              return res.json({ status: 'confirming', txHash: tx.tx_hash, message: 'Transakcja wykryta, czekam na potwierdzenia' });
            }
          }
        }
      } catch (e) { console.error(`Blockcypher ${method} error:`, e); }
    }

    // ── ETH / USDT via Etherscan ──
    if (method === 'eth' || method === 'usdt') {
      const etherscanKey = process.env.ETHERSCAN_API_KEY || '';
      try {
        let apiUrl: string;
        if (method === 'eth') {
          apiUrl = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=5&sort=desc&apikey=${etherscanKey}`;
        } else {
          apiUrl = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=0xdAC17F958D2ee523a2206206994597C13D831ec7&address=${address}&page=1&offset=5&sort=desc&apikey=${etherscanKey}`;
        }
        const apiRes = await fetch(apiUrl);
        const data: any = await apiRes.json();
        if (data.result && Array.isArray(data.result)) {
          for (const tx of data.result) {
            const value = method === 'eth' ? parseFloat(tx.value) / 1e18 : parseFloat(tx.value) / 1e6;
            if (value >= expectedAmount * 0.98 && tx.to.toLowerCase() === address.toLowerCase()) {
              confirmed = true; txHash = tx.hash; break;
            }
          }
        }
      } catch (e) { console.error(`Etherscan ${method} error:`, e); }
    }

    if (confirmed) {
      await supabase.from('payments').update({
        status: 'confirmed', crypto_tx_hash: txHash,
        updated_at: new Date().toISOString(), confirmed_at: new Date().toISOString(),
      }).eq('id', payment.id);
      await grantBoost(payment.user_id, payment.boost_days);
      return res.json({ status: 'confirmed', txHash, message: 'Płatność potwierdzona! Boost aktywowany.' });
    }

    res.json({ status: 'pending', message: 'Nie znaleziono pasującej transakcji' });
  } catch (err: any) {
    console.error('Crypto verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/payments/success — Stripe return URL
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/success', async (req, res) => {
  try {
    const { session_id, user_id } = req.query as { session_id?: string; user_id?: string };
    if (!session_id || !user_id) return res.status(400).send(htmlPage('Błąd', '❌ Brak parametrów.', '#ef4444'));

    const stripe = getStripe();
    if (!stripe) return res.status(500).send(htmlPage('Błąd', '❌ Stripe nie skonfigurowany.', '#ef4444'));

    const session = await stripe.checkout.sessions.retrieve(session_id);
    const isPaid = session.payment_status === 'paid' || session.status === 'complete';
    if (!isPaid) return res.status(400).send(htmlPage('Oczekiwanie', '⏳ Płatność jeszcze nie potwierdzona.', '#f59e0b'));

    const boostDays = parseInt(session.metadata?.boostDays || '30', 10);

    const supabase = getSupabase();
    await supabase.from('payments').update({
      status: 'confirmed', stripe_payment_intent: session.payment_intent as string,
      updated_at: new Date().toISOString(), confirmed_at: new Date().toISOString(),
    }).eq('stripe_session_id', session_id);

    await grantBoost(user_id, boostDays);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + boostDays);

    res.send(htmlPage(
      'DMX Boost Aktywowany! 🚀',
      `✅ Twój DMX Boost jest aktywny do <strong>${expiresAt.toLocaleDateString('pl-PL')}</strong>!<br><br>Wróć do aplikacji i ciesz się benefitami.`,
      '#22c55e',
    ));
  } catch (err: any) {
    console.error('Boost activation error:', err);
    res.status(500).send(htmlPage('Błąd', `❌ ${err.message}`, '#ef4444'));
  }
});

router.get('/cancel', (_req, res) => {
  res.send(htmlPage('Anulowano', '🙁 Zakup został anulowany. Możesz spróbować ponownie.', '#6b7280'));
});

/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/payments/redeem-code
   ═══════════════════════════════════════════════════════════════════════════ */
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

    const base = currentUser.hasDmxBoost && currentUser.dmxBoostExpiresAt
      ? new Date(currentUser.dmxBoostExpiresAt) : new Date();
    base.setDate(base.getDate() + entry.durationDays);

    const existingBadges: string[] = currentUser.badges || [];
    const newBadges = existingBadges.includes('dmx-boost') ? existingBadges : [...existingBadges, 'dmx-boost'];

    try {
      await db.updateUser(userId, { hasDmxBoost: true, dmxBoostExpiresAt: base, badges: newBadges } as any);
    } catch (updateErr: any) {
      await undoRedeemBoostCode(code, userId);
      return res.status(400).json({ error: updateErr.message || 'missingBoostColumns' });
    }

    const updatedUser = await db.getUserById(userId);
    res.json({ success: true, durationDays: entry.durationDays, expiresAt: base.toISOString(), user: updatedUser });
  } catch (err: any) {
    console.error('Redeem code error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/payments/history
   ═══════════════════════════════════════════════════════════════════════════ */
router.get('/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.from('payments')
      .select('id, plan, amount_usd, method, status, boost_days, created_at, confirmed_at')
      .eq('user_id', req.userId!).order('created_at', { ascending: false }).limit(20);
    res.json(data || []);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

async function grantBoost(userId: string, days: number) {
  const currentUser = await db.getUserById(userId);
  if (!currentUser) throw new Error('User not found');

  const base = currentUser.hasDmxBoost && currentUser.dmxBoostExpiresAt
    ? new Date(currentUser.dmxBoostExpiresAt) : new Date();
  base.setDate(base.getDate() + days);

  const existingBadges: string[] = currentUser.badges || [];
  const newBadges = existingBadges.includes('dmx-boost') ? existingBadges : [...existingBadges, 'dmx-boost'];
  await db.updateUser(userId, { hasDmxBoost: true, dmxBoostExpiresAt: base, badges: newBadges } as any);
}

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
