import { useState } from 'react';
import { X, AlertTriangle, Shield, Ban, Key, Info, Clock, User as UserIcon, Megaphone, UserX, XOctagon, MessageSquareWarning, Users2, FileText } from 'lucide-react';
import { UserRestrictions, UserRestriction } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';
import './ModerationModalNew.css';

interface ModerationModalProps {
  user: {
    id: string;
    username: string;
    email: string;
    avatar?: string;
    banner?: string;
    bio?: string;
    createdAt: Date;
    lastLoginIp?: string;
    lastLoginCountry?: string;
    language?: string;
    restrictions?: UserRestrictions;
    warnings?: UserRestriction[];
    activeRestrictions?: UserRestriction[];
  };
  token: string;
  onClose: () => void;
  onUpdate: () => void;
}

const WARNING_CATEGORIES = [
  { value: 'spam', label: 'Spam', icon: Megaphone, color: '#f59e0b' },
  { value: 'harassment', label: 'Nękanie', icon: UserX, color: '#ef4444' },
  { value: 'inappropriate', label: 'Treść niewłaściwa', icon: XOctagon, color: '#dc2626' },
  { value: 'language', label: 'Język/Wulgaryzmy', icon: MessageSquareWarning, color: '#f97316' },
  { value: 'impersonation', label: 'Podszywanie się', icon: Users2, color: '#ec4899' },
  { value: 'other', label: 'Inne', icon: FileText, color: '#8b5cf6' }
];

export function ModerationModalNew({ user, token, onClose, onUpdate }: ModerationModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'warnings' | 'restrictions' | 'actions'>('info');
  const [type] = useState<'warning' | 'restriction' | 'ban'>('warning');
  const [selectedCategory, setSelectedCategory] = useState<string>('other');
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
          category: type === 'warning' ? selectedCategory : undefined,
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

  const handleRemoveWarning = async (index: number) => {
    if (!confirm('Czy na pewno chcesz usunąć to ostrzeżenie?')) return;
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/admin/users/${user.id}/warnings/${index}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        onUpdate();
      } else {
        alert('Błąd podczas usuwania ostrzeżenia');
      }
    } catch (error) {
      console.error('Error removing warning:', error);
      alert('Błąd połączenia');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm(`Czy na pewno chcesz zresetować hasło użytkownika ${user.username}?`)) return;
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

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString('pl-PL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="moderation-modal-overlay-new" onClick={onClose}>
      <div className="moderation-modal-new" onClick={(e) => e.stopPropagation()}>
        {/* Header with user info */}
        <div className="modal-header-new">
          <div className="user-header-info">
            <div className="user-avatar-large">
              {user.avatar ? (
                <img src={getImageUrl(user.avatar)} alt={user.username} />
              ) : (
                <div className="avatar-placeholder">{user.username[0].toUpperCase()}</div>
              )}
            </div>
            <div className="user-header-details">
              <h2>{user.username}</h2>
              <p className="user-id">ID: {user.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="close-btn-new">
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="modal-tabs-new">
          <button
            className={`tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
          >
            <Info size={18} />
            Informacje
          </button>
          <button
            className={`tab-btn ${activeTab === 'warnings' ? 'active' : ''}`}
            onClick={() => setActiveTab('warnings')}
          >
            <AlertTriangle size={18} />
            Ostrzeżenia
            {user.warnings && user.warnings.length > 0 && (
              <span className="tab-badge">{user.warnings.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === 'restrictions' ? 'active' : ''}`}
            onClick={() => setActiveTab('restrictions')}
          >
            <Shield size={18} />
            Ograniczenia
            {user.activeRestrictions && user.activeRestrictions.length > 0 && (
              <span className="tab-badge">{user.activeRestrictions.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            <Ban size={18} />
            Akcje
          </button>
        </div>

        {/* Tab Content */}
        <div className="modal-content-new">
          {/* INFO TAB */}
          {activeTab === 'info' && (
            <div className="tab-content">
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-card-header">
                    <UserIcon size={20} />
                    <h3>Dane użytkownika</h3>
                  </div>
                  <div className="info-items">
                    <div className="info-item">
                      <span className="info-label">Nazwa użytkownika:</span>
                      <span className="info-value">{user.username}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Email:</span>
                      <span className="info-value">{user.email}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Bio:</span>
                      <span className="info-value">{user.bio || 'Brak'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Avatar:</span>
                      <span className="info-value">{user.avatar ? '✓ Ustawiony' : '✗ Brak'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Banner:</span>
                      <span className="info-value">{user.banner ? '✓ Ustawiony' : '✗ Brak'}</span>
                    </div>
                  </div>
                </div>

                <div className="info-card">
                  <div className="info-card-header">
                    <Clock size={20} />
                    <h3>Aktywność</h3>
                  </div>
                  <div className="info-items">
                    <div className="info-item">
                      <span className="info-label">Data rejestracji:</span>
                      <span className="info-value">{formatDate(user.createdAt)}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Ostatnie IP:</span>
                      <span className="info-value">{user.lastLoginIp || 'Brak danych'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Kraj:</span>
                      <span className="info-value">{user.lastLoginCountry || 'Nieznany'}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Język:</span>
                      <span className="info-value">{user.language || 'pl-PL'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WARNINGS TAB */}
          {activeTab === 'warnings' && (
            <div className="tab-content">
              <div className="add-warning-section">
                <h3>
                  <AlertTriangle size={20} />
                  Dodaj ostrzeżenie
                </h3>

                <div className="warning-categories">
                  {WARNING_CATEGORIES.map(cat => {
                    const IconComponent = cat.icon;
                    return (
                      <button
                        key={cat.value}
                        className={`category-btn ${selectedCategory === cat.value ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat.value)}
                        style={{
                          '--category-color': cat.color
                        } as React.CSSProperties}
                      >
                        <span className="category-icon"><IconComponent size={28} /></span>
                        <span className="category-label">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="form-group">
                  <label>Powód ostrzeżenia</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Opisz szczegółowo powód ostrzeżenia..."
                    rows={4}
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
                  className="add-warning-btn"
                >
                  <AlertTriangle size={16} />
                  Dodaj ostrzeżenie
                </button>
              </div>

              {/* Warnings History */}
              <div className="warnings-history">
                <h3>Historia ostrzeżeń ({user.warnings?.length || 0})</h3>
                {user.warnings && user.warnings.length > 0 ? (
                  <div className="warnings-list">
                    {user.warnings.map((warning, index) => {
                      const category = WARNING_CATEGORIES.find(c => c.value === warning.category);
                      const IconComponent = category?.icon;
                      return (
                        <div key={index} className="warning-item">
                          <div className="warning-header">
                            {category && IconComponent && (
                              <span className="warning-category" style={{ backgroundColor: category.color }}>
                                <IconComponent size={14} /> {category.label}
                              </span>
                            )}
                            <span className="warning-date">{formatDate(warning.issuedAt)}</span>
                            <button
                              className="remove-warning-btn"
                              onClick={() => handleRemoveWarning(index)}
                              disabled={loading}
                              title="Usuń ostrzeżenie"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <p className="warning-reason">{warning.reason}</p>
                          <div className="warning-footer">
                            <span className="warning-issuer">
                              Wydane przez: {warning.issuedByUsername || warning.issuedBy}
                            </span>
                            {warning.expiresAt && (
                              <span className="warning-expires">
                                Wygasa: {formatDate(warning.expiresAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty-state">Brak ostrzeżeń</p>
                )}
              </div>
            </div>
          )}

          {/* RESTRICTIONS TAB */}
          {activeTab === 'restrictions' && (
            <div className="tab-content">
              <div className="restrictions-section">
                <h3>
                  <Shield size={20} />
                  Zarządzaj ograniczeniami
                </h3>

                <div className="custom-checkboxes">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={restrictions.canAddFriends !== false}
                      onChange={(e) => setRestrictions({ ...restrictions, canAddFriends: e.target.checked })}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">Może dodawać znajomych</span>
                  </label>

                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={restrictions.canAcceptFriends !== false}
                      onChange={(e) => setRestrictions({ ...restrictions, canAcceptFriends: e.target.checked })}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">Może akceptować zaproszenia</span>
                  </label>

                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={restrictions.canSendMessages !== false}
                      onChange={(e) => setRestrictions({ ...restrictions, canSendMessages: e.target.checked })}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">Może wysyłać wiadomości</span>
                  </label>

                  <label className="custom-checkbox danger">
                    <input
                      type="checkbox"
                      checked={restrictions.isBanned === true}
                      onChange={(e) => setRestrictions({ ...restrictions, isBanned: e.target.checked })}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">Zbanowany (blokuje wszystko)</span>
                  </label>
                </div>

                <button
                  onClick={handleUpdateRestrictions}
                  disabled={loading}
                  className="update-restrictions-btn-new"
                >
                  Zaktualizuj ograniczenia
                </button>
              </div>

              {/* Active Restrictions */}
              {user.activeRestrictions && user.activeRestrictions.length > 0 && (
                <div className="active-restrictions-section">
                  <h3>Aktywne ograniczenia ({user.activeRestrictions.length})</h3>
                  <div className="restrictions-list">
                    {user.activeRestrictions.map((restriction, index) => (
                      <div key={index} className="restriction-item">
                        <div className="restriction-type-badge">{restriction.type}</div>
                        <p className="restriction-reason">{restriction.reason}</p>
                        <div className="restriction-footer">
                          <span className="restriction-issuer">
                            Wydane przez: {restriction.issuedByUsername || restriction.issuedBy}
                          </span>
                          <span className="restriction-date">{formatDate(restriction.issuedAt)}</span>
                          {restriction.expiresAt && (
                            <span className="restriction-expires">Wygasa: {formatDate(restriction.expiresAt)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ACTIONS TAB */}
          {activeTab === 'actions' && (
            <div className="tab-content">
              <div className="actions-grid">
                <div className="action-card">
                  <div className="action-card-header">
                    <Key size={20} />
                    <h3>Reset hasła</h3>
                  </div>
                  {resetPassword ? (
                    <div className="password-reset-result">
                      <div className="password-display-new">
                        <div className="password-label">Nowe hasło:</div>
                        <div className="password-value">{resetPassword}</div>
                      </div>
                      <button onClick={copyPassword} className="copy-password-btn-new">
                        Skopiuj hasło
                      </button>
                      <p className="password-note-new">
                        ⚠️ Przekaż to hasło użytkownikowi. Przy pierwszym logowaniu będzie musiał je zmienić.
                      </p>
                    </div>
                  ) : (
                    <button onClick={handleResetPassword} disabled={loading} className="action-btn reset">
                      <Key size={16} />
                      Resetuj hasło
                    </button>
                  )}
                </div>

                <div className="action-card danger">
                  <div className="action-card-header">
                    <Ban size={20} />
                    <h3>Wyczyść wszystko</h3>
                  </div>
                  <p className="action-description">
                    Usuń wszystkie ostrzeżenia, ograniczenia i bany.
                  </p>
                  <button onClick={handleClearRestrictions} disabled={loading} className="action-btn danger">
                    <Ban size={16} />
                    Wyczyść wszystkie ograniczenia
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
