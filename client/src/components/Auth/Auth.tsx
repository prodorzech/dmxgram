import { useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, User, Loader, CheckCircle, ShieldCheck } from 'lucide-react';
import './Auth.css';

export function Auth() {
  const { t } = useTranslation();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Email verification step
  const [pendingEmail, setPendingEmail] = useState('');
  const [verifyCode, setVerifyCode] = useState('');

  const { setUser, setToken } = useStore();

  const translateError = (msg: string) =>
    msg
      .replace('Email już istnieje', 'This email is already registered')
      .replace('Nazwa użytkownika zajęta', 'Username is already taken')
      .replace('Nieprawidłowy email lub hasło', 'Invalid email or password')
      .replace('Nieprawidłowe dane logowania', 'Invalid email or password')
      .replace('Wszystkie pola są wymagane', 'All fields are required')
      .replace('Email i hasło są wymagane', 'Email and password are required')
      .replace('Konto zostało zablokowane', 'Your account has been banned')
      .replace('Błąd serwera', 'Server error, please try again')
      .replace('errInvalidCode', t('auth.errInvalidCode'))
      .replace('errCodeExpired', t('auth.errCodeExpired'))
      .replace('errEmailNotVerified', t('auth.errEmailNotVerified'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLogin) {
        const response = await api.login(email, password);
        setSuccess(`Welcome back, ${response.user.username}! Logging you in...`);
        setTimeout(() => { setToken(response.token); setUser(response.user); }, 800);
      } else {
        const response = await api.register(username, email, password);
        if (response.needsVerification) {
          setPendingEmail(response.email);
        } else {
          // fallback if server returns a token directly (e.g. admin created account)
          setSuccess(`Account created! Welcome, ${response.user.username}!`);
          setTimeout(() => { setToken(response.token); setUser(response.user); }, 800);
        }
      }
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(translateError(err.message || 'An error occurred'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await api.verifyEmail(pendingEmail, verifyCode);
      setSuccess(`Email verified! Welcome, ${response.user.username}!`);
      setTimeout(() => { setToken(response.token); setUser(response.user); }, 800);
    } catch (err: any) {
      setError(translateError(err.message || 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await api.resendVerification(pendingEmail);
      setSuccess(t('auth.codeSent'));
    } catch (err: any) {
      setError(translateError(err.message || 'Failed to resend'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-background">
        <div className="auth-particles"></div>
        <div className="auth-gradient-orb auth-gradient-orb-1"></div>
        <div className="auth-gradient-orb auth-gradient-orb-2"></div>
        <div className="auth-gradient-orb auth-gradient-orb-3"></div>
      </div>

      <div className="auth-box">
        <div className="auth-header">
          <div className="auth-logo-wrapper">
            <img src="/logo.png" alt="DMXGram Logo" className="auth-logo-icon" />
          </div>
          <h1 className="auth-title">{t('app.title')}</h1>
          <p className="auth-subtitle">
            {pendingEmail
              ? t('auth.verifyEmail')
              : isLogin
              ? t('auth.loginToAccount')
              : t('auth.createNewAccount')}
          </p>
        </div>

        {/* ── Email verification screen ── */}
        {pendingEmail ? (
          <>
            <div className="verify-email-info">
              <ShieldCheck size={36} className="verify-icon" />
              <p>{t('auth.verifyEmailSent', { email: pendingEmail })}</p>
            </div>

            <form onSubmit={handleVerify} className="auth-form">
              <div className="form-group">
                <label htmlFor="verifyCode">{t('auth.verifyCode')}</label>
                <div className="input-wrapper">
                  <Mail className="input-icon" size={20} />
                  <input
                    id="verifyCode"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                    placeholder={t('auth.enterCode')}
                    required
                    autoFocus
                    disabled={loading}
                    className="verify-code-input"
                  />
                </div>
              </div>

              {success && (
                <div className="success-message">
                  <CheckCircle size={16} />
                  {success}
                </div>
              )}

              {error && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}

              <button type="submit" className="auth-button" disabled={loading}>
                {loading && <Loader className="button-icon spin" size={18} />}
                <span>{loading ? t('auth.verifying') : t('auth.verify')}</span>
                {!loading && <span className="button-arrow">→</span>}
              </button>
            </form>

            <div className="auth-divider">
              <span>{t('auth.didntReceiveCode')}</span>
            </div>

            <button
              type="button"
              onClick={handleResend}
              className="auth-switch-button"
              disabled={loading}
            >
              {t('auth.resendCode')}
            </button>

            <button
              type="button"
              onClick={() => { setPendingEmail(''); setVerifyCode(''); setError(''); setSuccess(''); }}
              className="auth-back-link"
              disabled={loading}
            >
              ← {t('auth.backToLogin')}
            </button>
          </>
        ) : (
          /* ── Normal login / register screen ── */
          <>
            <form onSubmit={handleSubmit} className="auth-form">
              {!isLogin && (
                <div className="form-group">
                  <label htmlFor="username">{t('auth.username')}</label>
                  <div className="input-wrapper">
                    <User className="input-icon" size={20} />
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={t('auth.enterUsername')}
                      required={!isLogin}
                      disabled={loading}
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="email">{t('auth.email')}</label>
                <div className="input-wrapper">
                  <Mail className="input-icon" size={20} />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('auth.enterEmail')}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password">{t('auth.password')}</label>
                <div className="input-wrapper">
                  <Lock className="input-icon" size={20} />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.enterPassword')}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              {success && (
                <div className="success-message">
                  <CheckCircle size={16} />
                  {success}
                </div>
              )}

              {error && (
                <div className="error-message">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}

              <button type="submit" className="auth-button" disabled={loading}>
                {loading && <Loader className="button-icon spin" size={18} />}
                <span>{loading ? t('auth.loggingIn') : isLogin ? t('auth.login') : t('auth.register')}</span>
                {!loading && <span className="button-arrow">→</span>}
              </button>
            </form>

            <div className="auth-divider">
              <span>{isLogin ? t('auth.dontHaveAccount') : t('auth.alreadyHaveAccount')}</span>
            </div>

            <button
              type="button"
              onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="auth-switch-button"
              disabled={loading}
            >
              {isLogin ? t('auth.register') : t('auth.login')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
