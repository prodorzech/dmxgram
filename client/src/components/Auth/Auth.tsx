import { useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { useTranslation } from 'react-i18next';
import { Mail, Lock, User, Loader, CheckCircle } from 'lucide-react';
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

  const { setUser, setToken } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      let response;
      if (isLogin) {
        response = await api.login(email, password);
        setSuccess(`Welcome back, ${response.user.username}! Logging you in...`);
      } else {
        response = await api.register(username, email, password);
        setSuccess(`Account created successfully! Welcome, ${response.user.username}!`);
      }

      setTimeout(() => {
        setToken(response.token);
        setUser(response.user);
      }, 800);
    } catch (err: any) {
      console.error('Auth error:', err);
      // Translate common server errors to English
      const msg: string = err.message || 'An error occurred';
      const englishMsg = msg
        .replace('Email już istnieje', 'This email is already registered')
        .replace('Nazwa użytkownika zajęta', 'Username is already taken')
        .replace('Nieprawidłowy email lub hasło', 'Invalid email or password')
        .replace('Wszystkie pola są wymagane', 'All fields are required')
        .replace('Email i hasło są wymagane', 'Email and password are required')
        .replace('Konto zostało zablokowane', 'Your account has been banned')
        .replace('Błąd serwera', 'Server error, please try again');
      setError(englishMsg);
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
            {isLogin ? t('auth.loginToAccount') : t('auth.createNewAccount')}
          </p>
        </div>

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
          onClick={() => {
            setIsLogin(!isLogin);
            setError('');
          }}
          className="auth-switch-button"
          disabled={loading}
        >
          {isLogin ? t('auth.register') : t('auth.login')}
        </button>
      </div>
    </div>
  );
}
