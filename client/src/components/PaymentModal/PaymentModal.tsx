import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import './PaymentModal.css';

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════ */
interface Plan {
  label: string;
  days: number;
  priceUsd: number;
}

interface PaymentModalProps {
  token: string;
  onClose: () => void;
  onSuccess: () => void;  // called after successful payment to refresh user data
}

type PaymentMethod = 'btc' | 'ltc' | 'eth' | 'usdt' | 'card' | 'paypal';
type Step = 'plan' | 'method' | 'pay' | 'success';

/* ═══════════════════════════════════════════════════════════════════════════
   CRYPTO ICONS (inline SVG for zero-dependency)
   ═══════════════════════════════════════════════════════════════════════════ */
const MethodIcon: React.FC<{ method: PaymentMethod }> = ({ method }) => {
  switch (method) {
    case 'btc':
      return <div className="method-icon btc">₿</div>;
    case 'ltc':
      return <div className="method-icon ltc">Ł</div>;
    case 'eth':
      return <div className="method-icon eth">Ξ</div>;
    case 'usdt':
      return <div className="method-icon usdt">₮</div>;
    case 'card':
      return (
        <div className="method-icon card">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
            <line x1="1" y1="10" x2="23" y2="10" />
          </svg>
        </div>
      );
    case 'paypal':
      return <div className="method-icon paypal" style={{ fontWeight: 800, fontSize: 16 }}>PP</div>;
    default:
      return null;
  }
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  btc: 'Bitcoin',
  ltc: 'Litecoin',
  eth: 'Ethereum',
  usdt: 'USDT',
  card: 'Card',
  paypal: 'PayPal',
};

/* ═══════════════════════════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export function PaymentModal({ token, onClose, onSuccess }: PaymentModalProps) {
  const { t } = useTranslation();
  /* ── State ── */
  const [step, setStep] = useState<Step>('plan');
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Crypto payment state
  const [cryptoPaymentId, setCryptoPaymentId] = useState('');
  const [cryptoAddress, setCryptoAddress] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoCurrency, setCryptoCurrency] = useState('');
  const [cryptoExpiresAt, setCryptoExpiresAt] = useState('');
  const [cryptoStatus, setCryptoStatus] = useState<'pending' | 'confirming' | 'confirmed' | 'expired' | 'failed'>('pending');
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Fetch plans on mount ── */
  useEffect(() => {
    (async () => {
      try {
        const data = await api.getPaymentPlans();
        setPlans(data.plans);
        setMethods(data.methods as PaymentMethod[]);
        // Auto-select first plan
        const keys = Object.keys(data.plans);
        if (keys.length > 0) setSelectedPlan(keys[0]);
      } catch {
        setError(t('payment.errorFetchPlans'));
      }
    })();
  }, []);

  /* ── Timer countdown for crypto ── */
  useEffect(() => {
    if (step !== 'pay' || !cryptoExpiresAt) return;

    const updateTimer = () => {
      const diff = new Date(cryptoExpiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('00:00');
        setCryptoStatus('expired');
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [step, cryptoExpiresAt]);

  /* ── Auto-poll crypto status ── */
  useEffect(() => {
    if (step !== 'pay' || !cryptoPaymentId) return;

    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getPaymentStatus(cryptoPaymentId, token);
        if (status.status === 'confirmed') {
          setCryptoStatus('confirmed');
          if (pollRef.current) clearInterval(pollRef.current);
          // Move to success after brief delay
          setTimeout(() => {
            setStep('success');
            onSuccess();
          }, 1500);
        } else if (status.status === 'confirming') {
          setCryptoStatus('confirming');
        } else if (status.status === 'expired') {
          setCryptoStatus('expired');
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {/* ignore */}
    }, 10000); // Check every 10s

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, cryptoPaymentId, token, onSuccess]);

  /* ── Cleanup ── */
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  /* ── Handlers ── */
  const handleCreatePayment = useCallback(async () => {
    if (!selectedPlan || !selectedMethod) return;
    setLoading(true);
    setError('');

    try {
      const result = await api.createPayment(selectedPlan, selectedMethod, token);

      if (result.type === 'redirect') {
        // Card / PayPal — open Stripe checkout
        if ((window as any).electronAPI?.openExternal) {
          (window as any).electronAPI.openExternal(result.url);
        } else {
          window.open(result.url, '_blank');
        }
        onClose(); // Close modal, Stripe handles the rest
        return;
      }

      if (result.type === 'crypto') {
        setCryptoPaymentId(result.paymentId);
        setCryptoAddress(result.address);
        setCryptoAmount(result.amount);
        setCryptoCurrency(result.currency);
        setCryptoExpiresAt(result.expiresAt);
        setCryptoStatus('pending');
        setStep('pay');
      }
    } catch (err: any) {
      setError(err.message || t('payment.errorCreatePayment'));
    } finally {
      setLoading(false);
    }
  }, [selectedPlan, selectedMethod, token, onClose]);

  const handleVerifyCrypto = async () => {
    if (!cryptoPaymentId) return;
    setVerifying(true);
    setError('');
    try {
      const result = await api.verifyCryptoPayment(cryptoPaymentId, token);
      if (result.status === 'confirmed') {
        setCryptoStatus('confirmed');
        setTimeout(() => {
          setStep('success');
          onSuccess();
        }, 1500);
      } else if (result.status === 'confirming') {
        setCryptoStatus('confirming');
      } else if (result.error) {
        setError(result.error);
      } else {
        setError(t('payment.errorNotDetected'));
      }
    } catch (err: any) {
      setError(err.message || t('payment.errorVerifyFailed'));
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(cryptoAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAmount = () => {
    navigator.clipboard.writeText(cryptoAmount);
  };

  /* ── Step navigation ── */
  const goNext = () => {
    if (step === 'plan' && selectedPlan) setStep('method');
    else if (step === 'method' && selectedMethod) handleCreatePayment();
  };

  const goBack = () => {
    setError('');
    if (step === 'method') setStep('plan');
    else if (step === 'pay') {
      setStep('method');
      setCryptoPaymentId('');
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  /* ── Step index for dots ── */
  const stepIdx = step === 'plan' ? 0 : step === 'method' ? 1 : step === 'pay' ? 2 : 3;

  const currentPlan = plans[selectedPlan];

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="payment-overlay" onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="payment-modal">
        {/* Header */}
        <div className="payment-header">
          <h2>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 3h12l4.5 8-10.5 10L1.5 11z" />
            </svg>
            DMX Boost
          </h2>
          <button className="payment-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="payment-body">
          {/* Step dots */}
          <div className="payment-steps">
            {[0, 1, 2, 3].map((i) => (
              <span key={i}>
                {i > 0 && <span className={`payment-step-line ${stepIdx > i - 1 ? 'done' : ''}`} />}
                <span className={`payment-step-dot ${stepIdx === i ? 'active' : stepIdx > i ? 'done' : ''}`} />
              </span>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              borderRadius: 8,
              padding: '10px 14px',
              marginBottom: 16,
              color: '#ef4444',
              fontSize: 13,
              fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          {/* ════════════ STEP 1: Plan Selection ════════════ */}
          {step === 'plan' && (
            <>
              <div className="payment-section-title">{t('payment.choosePlan')}</div>
              <div className="plan-grid">
                {Object.entries(plans).map(([key, plan]) => {
                  const isPopular = key === '3months';
                  const perMonth = (plan.priceUsd / (plan.days / 30)).toFixed(2);
                  const planKey = `payment.plan${key}` as const;
                  return (
                    <div
                      key={key}
                      className={`plan-card ${selectedPlan === key ? 'selected' : ''}`}
                      onClick={() => setSelectedPlan(key)}
                    >
                      {isPopular && <span className="plan-card-badge">Popular</span>}
                      <div className="plan-card-label">{t(planKey as any)}</div>
                      <div className="plan-card-price">${plan.priceUsd}</div>
                      <div className="plan-card-per">${perMonth}{t('payment.perMonth')}</div>
                    </div>
                  );
                })}
              </div>

              <div className="payment-nav">
                <div />
                <button
                  className="payment-next-btn"
                  disabled={!selectedPlan}
                  onClick={goNext}
                >
                  {t('payment.next')}
                </button>
              </div>
            </>
          )}

          {/* ════════════ STEP 2: Payment Method ════════════ */}
          {step === 'method' && (
            <>
              {/* Price summary */}
              {currentPlan && (
                <div className="payment-summary">
                  <span className="payment-summary-label">
                    {currentPlan.label} — DMX Boost
                  </span>
                  <span className="payment-summary-value">${currentPlan.priceUsd}</span>
                </div>
              )}

              <div className="payment-section-title">{t('payment.paymentMethod')}</div>
              <div className="method-grid">
                {(['btc', 'ltc', 'eth', 'usdt', 'card', 'paypal'] as PaymentMethod[]).map((m) => {
                  const available = methods.includes(m);
                  return (
                    <div
                      key={m}
                      className={`method-card ${selectedMethod === m ? 'selected' : ''} ${!available ? 'disabled' : ''}`}
                      onClick={() => available && setSelectedMethod(m)}
                    >
                      <MethodIcon method={m} />
                      <span className="method-label">{m === 'card' ? t('payment.card') : METHOD_LABELS[m]}</span>
                    </div>
                  );
                })}
              </div>

              <div className="payment-nav">
                <button className="payment-back-btn" onClick={goBack}>
                  {t('payment.back')}
                </button>
                <button
                  className="payment-next-btn"
                  disabled={!selectedMethod || loading}
                  onClick={goNext}
                >
                  {loading ? t('payment.creating') : t('payment.pay')}
                </button>
              </div>

              <div className="payment-note">
                {selectedMethod && ['card', 'paypal'].includes(selectedMethod)
                  ? t('payment.redirectNote')
                  : selectedMethod
                    ? t('payment.cryptoNote')
                    : ''}
              </div>
            </>
          )}

          {/* ════════════ STEP 3: Crypto Payment ════════════ */}
          {step === 'pay' && (
            <>
              {currentPlan && (
                <div className="payment-summary">
                  <span className="payment-summary-label">
                    {currentPlan.label} — {cryptoCurrency}
                  </span>
                  <span className="payment-summary-value">${currentPlan.priceUsd}</span>
                </div>
              )}

              <div className="crypto-pay-box">
                {/* Amount */}
                <div className="crypto-amount-row">
                  <span className="crypto-amount" onClick={handleCopyAmount} style={{ cursor: 'pointer' }} title={t('payment.clickToCopy')}>
                    {cryptoAmount}
                  </span>
                  <span className="crypto-currency">{cryptoCurrency}</span>
                </div>

                {/* Address */}
                <div className="payment-section-title">{t('payment.walletAddress')}</div>
                <div className="crypto-address-box">
                  <span className="crypto-address-text">{cryptoAddress}</span>
                  <button className="crypto-copy-btn" onClick={handleCopyAddress}>
                    {copied ? t('payment.copied') : t('payment.copy')}
                  </button>
                </div>

                {/* Timer */}
                {cryptoStatus === 'pending' && (
                  <div className="crypto-timer">
                    {t('payment.timeLeft')}<strong>{timeLeft}</strong>
                  </div>
                )}

                {/* Verify button */}
                {cryptoStatus === 'pending' && (
                  <button
                    className="crypto-verify-btn"
                    onClick={handleVerifyCrypto}
                    disabled={verifying}
                  >
                    {verifying ? (
                      <>
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                        {t('payment.verifying')}
                      </>
                    ) : (
                      <>🔍 {t('payment.verifyPayment')}</>
                    )}
                  </button>
                )}

                {/* Status indicator */}
                {cryptoStatus === 'confirming' && (
                  <div className="crypto-status confirming">
                    ⏳ {t('payment.statusConfirming')}
                  </div>
                )}
                {cryptoStatus === 'confirmed' && (
                  <div className="crypto-status confirmed">
                    ✅ {t('payment.statusConfirmed')}
                  </div>
                )}
                {cryptoStatus === 'expired' && (
                  <div className="crypto-status pending" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>
                    ⏰ {t('payment.statusExpired')}
                  </div>
                )}
              </div>

              {/* Back only if still pending */}
              {(cryptoStatus === 'pending' || cryptoStatus === 'expired') && (
                <div className="payment-nav">
                  <button className="payment-back-btn" onClick={goBack}>
                    {t('payment.back')}
                  </button>
                  <div />
                </div>
              )}

              <div className="payment-note">
                {t('payment.cryptoPayNote')}
              </div>
            </>
          )}

          {/* ════════════ STEP 4: Success ════════════ */}
          {step === 'success' && (
            <>
              <div className="payment-success-box">
                <div className="payment-success-icon">🚀</div>
                <div className="payment-success-title">{t('payment.successTitle')}</div>
                <div className="payment-success-desc">
                  {t('payment.successDesc', { days: currentPlan?.days || '?' })}
                  <br />
                  {t('payment.successEnjoy')}
                </div>
              </div>

              <div className="payment-nav">
                <div />
                <button className="payment-next-btn" onClick={onClose}>
                  {t('payment.close')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
