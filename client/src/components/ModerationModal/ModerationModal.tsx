import { useState } from 'react';
import { X, AlertTriangle, Shield, Ban, Key } from 'lucide-react';
import { UserRestrictions } from '../../types';
import './ModerationModal.css';

interface ModerationModalProps {
  user: {
    id: string;
    username: string;
    restrictions?: UserRestrictions;
    warnings?: any[];
    activeRestrictions?: any[];
  };
  token: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function ModerationModal({ user, token, onClose, onUpdate }: ModerationModalProps) {
  const [type, setType] = useState<'warning' | 'restriction' | 'ban'>('warning');
  const [reason, setReason] = useState('');
  const [expiresIn, setExpiresIn] = useState<number | ''>('');
  const [restrictions, setRestrictions] = useState<UserRestrictions>(user.restrictions || {
    canAddFriends: true,
    canAcceptFriends: true,
    canSendMessages: true,
    isBanned: false
  });
  const [loading, setLoading] = useState(false);
  const [resetPassword, setResetPassword] = useState<string | null>(null);

  const handleAddModeration = async () => {
    if (!reason.trim()) {
      alert('Podaj powód');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/admin/users/${user.id}/moderation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type,
          reason: reason.trim(),
          expiresIn: expiresIn ? Number(expiresIn) : undefined
        })
      });

      if (response.ok) {
        alert(`${type === 'warning' ? 'Ostrzeżenie' : type === 'ban' ? 'Ban' : 'Ograniczenie'} dodane`);
        setReason('');
        setExpiresIn('');
        onUpdate();
      } else {
        alert('Błąd podczas dodawania moderacji');
      }
    } catch (error) {
      console.error('Error adding moderation:', error);
      alert('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateRestrictions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/admin/users/${user.id}/restrictions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ restrictions })
      });

      if (response.ok) {
        alert('Ograniczenia zaktualizowane');
        onUpdate();
      } else {
        alert('Błąd podczas aktualizacji ograniczeń');
      }
    } catch (error) {
      console.error('Error updating restrictions:', error);
      alert('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const handleClearRestrictions = async () => {
    if (!confirm('Czy na pewno chcesz usunąć wszystkie ograniczenia?')) return;

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/admin/users/${user.id}/clear-restrictions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('Wszystkie ograniczenia zostały usunięte');
        onUpdate();
        onClose();
      } else {
        alert('Błąd podczas usuwania ograniczeń');
      }
    } catch (error) {
      console.error('Error clearing restrictions:', error);
      alert('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm(`Czy na pewno chcesz zresetować hasło użytkownika ${user.username}? Zostanie wygenerowane nowe hasło, które musisz przekazać użytkownikowi.`)) return;

    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setResetPassword(data.password);
      } else {
        alert('Błąd podczas resetowania hasła');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = () => {
    if (resetPassword) {
      navigator.clipboard.writeText(resetPassword);
      alert('Hasło skopiowane do schowka');
    }
  };

  return (
    <div className="moderation-modal-overlay" onClick={onClose}>
      <div className="moderation-modal" onClick={(e) => e.stopPropagation()}>
        <div className="moderation-modal-header">
          <h2>Moderacja: {user.username}</h2>
          <button onClick={onClose} className="close-btn">
            <X size={20} />
          </button>
        </div>

        <div className="moderation-modal-content">
          {/* Add Warning/Restriction/Ban */}
          <div className="moderation-section">
            <h3>
              {type === 'warning' && <AlertTriangle size={20} />}
              {type === 'restriction' && <Shield size={20} />}
              {type === 'ban' && <Ban size={20} />}
              Dodaj moderację
            </h3>
            
            <div className="form-group">
              <label>Typ</label>
              <div className="moderation-type-buttons">
                <button
                  className={`type-btn ${type === 'warning' ? 'active' : ''}`}
                  onClick={() => setType('warning')}
                >
                  <AlertTriangle size={16} />
                  Ostrzeżenie
                </button>
                <button
                  className={`type-btn ${type === 'restriction' ? 'active' : ''}`}
                  onClick={() => setType('restriction')}
                >
                  <Shield size={16} />
                  Ograniczenie
                </button>
                <button
                  className={`type-btn ${type === 'ban' ? 'active' : ''}`}
                  onClick={() => setType('ban')}
                >
                  <Ban size={16} />
                  Ban
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Powód</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Opisz powód moderacji..."
                rows={3}
              />
            </div>

            <div className="form-group">
              <label>Wygasa za (ms) - opcjonalne</label>
              <input
                type="number"
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value ? Number(e.target.value) : '')}
                placeholder="np. 86400000 = 24h"
              />
              <small>Pozostaw puste dla permanentnego</small>
            </div>

            <button
              onClick={handleAddModeration}
              disabled={loading || !reason.trim()}
              className="add-moderation-btn"
            >
              Dodaj {type === 'warning' ? 'ostrzeżenie' : type === 'ban' ? 'bana' : 'ograniczenie'}
            </button>
          </div>

          {/* Manual Restrictions */}
          <div className="moderation-section">
            <h3>Ograniczenia manualne</h3>
            
            <div className="restriction-toggles">
              <label className="restriction-toggle">
                <input
                  type="checkbox"
                  checked={restrictions.canAddFriends !== false}
                  onChange={(e) => setRestrictions({ ...restrictions, canAddFriends: e.target.checked })}
                />
                <span>Może dodawać znajomych</span>
              </label>

              <label className="restriction-toggle">
                <input
                  type="checkbox"
                  checked={restrictions.canAcceptFriends !== false}
                  onChange={(e) => setRestrictions({ ...restrictions, canAcceptFriends: e.target.checked })}
                />
                <span>Może akceptować zaproszenia</span>
              </label>

              <label className="restriction-toggle">
                <input
                  type="checkbox"
                  checked={restrictions.canSendMessages !== false}
                  onChange={(e) => setRestrictions({ ...restrictions, canSendMessages: e.target.checked })}
                />
                <span>Może wysyłać wiadomości</span>
              </label>

              <label className="restriction-toggle ban">
                <input
                  type="checkbox"
                  checked={restrictions.isBanned === true}
                  onChange={(e) => setRestrictions({ ...restrictions, isBanned: e.target.checked })}
                />
                <span>Zbanowany (blokuje wszystko)</span>
              </label>
            </div>

            <button
              onClick={handleUpdateRestrictions}
              disabled={loading}
              className="update-restrictions-btn"
            >
              Zaktualizuj ograniczenia
            </button>
          </div>

          {/* Password Reset */}
          <div className="moderation-section">
            <h3>
              <Key size={20} />
              Reset hasła
            </h3>
            
            {resetPassword ? (
              <div className="password-reset-result">
                <div className="password-display">
                  <div className="password-label">Nowe hasło dla użytkownika:</div>
                  <div className="password-value">{resetPassword}</div>
                </div>
                <button onClick={copyPassword} className="copy-password-btn">
                  Skopiuj hasło
                </button>
                <p className="password-note">
                  ⚠️ Przekaż to hasło użytkownikowi. Przy pierwszym logowaniu będzie musiał je zmienić.
                  To hasło nie zostanie ponownie wyświetlone!
                </p>
              </div>
            ) : (
              <button
                onClick={handleResetPassword}
                disabled={loading}
                className="reset-password-btn"
              >
                <Key size={16} />
                Resetuj hasło użytkownika
              </button>
            )}
          </div>

          {/* Clear All */}
          <div className="moderation-section">
            <button
              onClick={handleClearRestrictions}
              disabled={loading}
              className="clear-restrictions-btn"
            >
              Wyczyść wszystkie ograniczenia i ostrzeżenia
            </button>
          </div>

          {/* Active Restrictions */}
          {user.activeRestrictions && user.activeRestrictions.length > 0 && (
            <div className="moderation-section">
              <h3>Aktywne ograniczenia</h3>
              <div className="active-restrictions-list">
                {user.activeRestrictions.map((r, index) => (
                  <div key={index} className="active-restriction-item">
                    <div className="restriction-type">{r.type}</div>
                    <div className="restriction-reason">{r.reason}</div>
                    <div className="restriction-date">
                      {new Date(r.issuedAt).toLocaleString('pl-PL')}
                      {r.expiresAt && ` - ${new Date(r.expiresAt).toLocaleString('pl-PL')}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
