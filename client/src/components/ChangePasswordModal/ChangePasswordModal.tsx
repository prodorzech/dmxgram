import { useState } from 'react';
import { Key, X, AlertCircle, CheckCircle } from 'lucide-react';
import { useUI } from '../../context/UIContext';
import './ChangePasswordModal.css';

interface ChangePasswordModalProps {
  isForced?: boolean; // If true, user cannot close without changing password
  onClose: () => void;
  onSuccess: () => void;
}

const passwordRequirements = [
  { text: 'Minimum 8 znaków', test: (p: string) => p.length >= 8 },
  { text: 'Przynajmniej jedna wielka litera', test: (p: string) => /[A-Z]/.test(p) },
  { text: 'Przynajmniej jedna mała litera', test: (p: string) => /[a-z]/.test(p) },
  { text: 'Przynajmniej jedna cyfra', test: (p: string) => /[0-9]/.test(p) },
  { text: 'Przynajmniej jeden znak specjalny', test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) }
];

export function ChangePasswordModal({ isForced = false, onClose, onSuccess }: ChangePasswordModalProps) {
  const { toast } = useUI();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePassword = (password: string) => {
    return passwordRequirements.every(req => req.test(password));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate new password
    if (!validatePassword(newPassword)) {
      setError('Hasło nie spełnia wymagań');
      return;
    }

    // Check if passwords match
    if (newPassword !== confirmPassword) {
      setError('Hasła nie są identyczne');
      return;
    }

    // If not forced, require current password
    if (!isForced && !currentPassword.trim()) {
      setError('Podaj obecne hasło');
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/auth/me/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: isForced ? undefined : currentPassword,
          newPassword
        })
      });

      if (response.ok) {
        toast('Hasło zostało zmienione pomyślnie!', 'success');
        onSuccess();
      } else {
        const data = await response.json();
        setError(data.error || 'Błąd podczas zmiany hasła');
      }
    } catch (err: any) {
      setError('Błąd połączenia z serwerem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="change-password-overlay" onClick={isForced ? undefined : onClose}>
      <div className="change-password-modal" onClick={(e) => e.stopPropagation()}>
        <div className="change-password-header">
          <div className="header-content">
            <Key size={24} />
            <h2>{isForced ? 'Wymagana zmiana hasła' : 'Zmień hasło'}</h2>
          </div>
          {!isForced && (
            <button className="close-btn" onClick={onClose}>
              <X size={20} />
            </button>
          )}
        </div>

        {isForced && (
          <div className="forced-notice">
            <AlertCircle size={20} />
            <p>
              Administrator zresetował Twoje hasło. Musisz ustawić nowe hasło, aby kontynuować.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="change-password-form">
          {!isForced && (
            <div className="form-group">
              <label htmlFor="current-password">Obecne hasło</label>
              <input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Wprowadź obecne hasło"
                disabled={loading}
                autoComplete="current-password"
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="new-password">Nowe hasło</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Wprowadź nowe hasło"
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password">Potwierdź nowe hasło</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Wprowadź ponownie nowe hasło"
              disabled={loading}
              autoComplete="new-password"
            />
          </div>

          <div className="password-requirements">
            <div className="requirements-title">Wymagania hasła:</div>
            {passwordRequirements.map((req, index) => {
              const isMet = newPassword && req.test(newPassword);
              return (
                <div key={index} className={`requirement ${isMet ? 'met' : ''}`}>
                  {isMet ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                  <span>{req.text}</span>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="error-message">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="submit-btn"
            disabled={loading || !validatePassword(newPassword) || newPassword !== confirmPassword}
          >
            {loading ? 'Zmiana hasła...' : 'Zmień hasło'}
          </button>
        </form>
      </div>
    </div>
  );
}
