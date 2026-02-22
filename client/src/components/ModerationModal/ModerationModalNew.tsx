import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, Shield, Ban, Key, Info, Clock, User as UserIcon, Megaphone, UserX, XOctagon, MessageSquareWarning, Users2, FileText, Award } from 'lucide-react';
import { UserRestrictions, UserRestriction } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';
import { useUI } from '../../context/UIContext';
import { BADGE_DEFS } from '../UserBadges/UserBadges';
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
    badges?: string[];
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
  const { toast, confirm: uiConfirm } = useUI();
  const { t } = useTranslation();

  const getCatLabel = (value: string): string => {
    const map: Record<string, string> = {
      spam: t('report.catSpam'),
      harassment: t('report.catHarassment'),
      inappropriate: t('report.catInappropriate'),
      language: t('report.catLanguage'),
      impersonation: t('report.catImpersonation'),
      other: t('report.catOther'),
    };
    return map[value] || value;
  };
  const [activeTab, setActiveTab] = useState<'info' | 'warnings' | 'restrictions' | 'actions' | 'badges'>('info');
  const [localBadges, setLocalBadges] = useState<string[]>(user.badges || []);
  const [badgesLoading, setBadgesLoading] = useState(false);
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

  const handleBadgeToggle = async (badgeId: string) => {
    const newBadges = localBadges.includes(badgeId)
      ? localBadges.filter(b => b !== badgeId)
      : [...localBadges, badgeId];
    setBadgesLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/admin/users/${user.id}/badges`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ badges: newBadges })
      });
      if (response.ok) {
        setLocalBadges(newBadges);
        toast(t('admin.badgesUpdated'), 'success');
        onUpdate();
      } else {
        toast(t('admin.badgesError'), 'error');
      }
    } catch (error) {
      console.error('Error updating badges:', error);
      toast(t('admin.connError'), 'error');
    } finally {
      setBadgesLoading(false);
    }
  };

  const handleAddModeration = async () => {
    if (!reason.trim()) {
      toast(t('admin.modEnterReason'), 'warning');
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
          expiresIn: expiresIn ? Number(expiresIn) * 60 * 1000 : undefined
        })
      });

      if (response.ok) {
        toast(`${type === 'warning' ? 'Warning' : type === 'ban' ? 'Ban' : 'Restriction'} added`, 'success');
        setReason('');
        setExpiresIn('');
        onUpdate();
      } else {
        toast('Failed to add moderation action', 'error');
      }
    } catch (error) {
      console.error('Error adding moderation:', error);
      toast('Connection error', 'error');
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
        toast('Restrictions updated', 'success');
        onUpdate();
      } else {
        toast('Failed to update restrictions', 'error');
      }
    } catch (error) {
      console.error('Error updating restrictions:', error);
      toast('Connection error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleClearRestrictions = async () => {
    if (!(await uiConfirm('Are you sure you want to remove all restrictions?'))) return;

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
        toast('All restrictions removed', 'success');
        onUpdate();
        onClose();
      } else {
        toast('Failed to remove restrictions', 'error');
      }
    } catch (error) {
      console.error('Error clearing restrictions:', error);
      toast('Connection error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveWarning = async (index: number) => {
    if (!(await uiConfirm('Are you sure you want to remove this warning?'))) return;
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/admin/users/${user.id}/warnings/${index}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        onUpdate();
      } else {
        toast('Failed to remove warning', 'error');
      }
    } catch (error) {
      console.error('Error removing warning:', error);
      toast('Connection error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!(await uiConfirm(`Are you sure you want to reset the password for ${user.username}?`))) return;
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
        toast('Failed to reset password', 'error');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast('Connection error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = () => {
    if (resetPassword) {
      navigator.clipboard.writeText(resetPassword);
      toast('Password copied to clipboard', 'success');
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
            {t('admin.tabInfo')}
          </button>
          <button
            className={`tab-btn ${activeTab === 'warnings' ? 'active' : ''}`}
            onClick={() => setActiveTab('warnings')}
          >
            <AlertTriangle size={18} />
            {t('admin.tabWarnings')}
            {user.warnings && user.warnings.length > 0 && (
              <span className="tab-badge">{user.warnings.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === 'restrictions' ? 'active' : ''}`}
            onClick={() => setActiveTab('restrictions')}
          >
            <Shield size={18} />
            {t('admin.tabRestrictions')}
            {user.activeRestrictions && user.activeRestrictions.length > 0 && (
              <span className="tab-badge">{user.activeRestrictions.length}</span>
            )}
          </button>
          <button
            className={`tab-btn ${activeTab === 'actions' ? 'active' : ''}`}
            onClick={() => setActiveTab('actions')}
          >
            <Ban size={18} />
            {t('admin.tabActions')}
          </button>
          <button
            className={`tab-btn ${activeTab === 'badges' ? 'active' : ''}`}
            onClick={() => setActiveTab('badges')}
          >
            <Award size={18} />
            {t('admin.tabBadges')}
            {localBadges.length > 0 && (
              <span className="tab-badge">{localBadges.length}</span>
            )}
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
                    <h3>{t('admin.modUserData')}</h3>
                  </div>
                  <div className="info-items">
                    <div className="info-item">
                      <span className="info-label">{t('admin.modUsernameLabel')}</span>
                      <span className="info-value">{user.username}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Email:</span>
                      <span className="info-value">{user.email}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">{t('admin.modBioLabel')}</span>
                      <span className="info-value">{user.bio || t('admin.modNone')}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">{t('admin.modAvatarLabel')}</span>
                      <span className="info-value">{user.avatar ? t('admin.modSet') : t('admin.modNotSet')}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">{t('admin.modBannerLabel')}</span>
                      <span className="info-value">{user.banner ? t('admin.modSet') : t('admin.modNotSet')}</span>
                    </div>
                  </div>
                </div>

                <div className="info-card">
                  <div className="info-card-header">
                    <Clock size={20} />
                    <h3>{t('admin.modActivity')}</h3>
                  </div>
                  <div className="info-items">
                    <div className="info-item">
                      <span className="info-label">{t('admin.modRegDate')}</span>
                      <span className="info-value">{formatDate(user.createdAt)}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">{t('admin.modLastIp')}</span>
                      <span className="info-value">{user.lastLoginIp || t('admin.modNoData')}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">{t('admin.modCountry')}</span>
                      <span className="info-value">{user.lastLoginCountry || t('admin.modUnknown')}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">{t('admin.modLanguageLabel')}</span>
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
                  {t('admin.modAddWarning')}
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
                        <span className="category-label">{getCatLabel(cat.value)}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="form-group">
                  <label>{t('admin.modWarningReason')}</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('admin.modWarningReasonPlaceholder')}
                    rows={4}
                  />
                </div>

                <div className="form-group">
                  <label>{t('admin.modExpiresIn')}</label>
                  <input
                    type="number"
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(e.target.value ? Number(e.target.value) : '')}
                    placeholder={t('admin.modExpiresPlaceholder')}
                  />
                  <small>{t('admin.modPermanent')}</small>
                </div>

                <button
                  onClick={handleAddModeration}
                  disabled={loading || !reason.trim()}
                  className="add-warning-btn"
                >
                  <AlertTriangle size={16} />
                  {t('admin.modAddWarning')}
                </button>
              </div>

              {/* Warnings History */}
              <div className="warnings-history">
                <h3>{t('admin.modWarningHistoryTitle', { count: user.warnings?.length || 0 })}</h3>
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
                                <IconComponent size={14} /> {getCatLabel(category.value)}
                              </span>
                            )}
                            <span className="warning-date">{formatDate(warning.issuedAt)}</span>
                            <button
                              className="remove-warning-btn"
                              onClick={() => handleRemoveWarning(index)}
                              disabled={loading}
                              title={t('admin.modRemoveWarning')}
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <p className="warning-reason">{warning.reason}</p>
                          <div className="warning-footer">
                            <span className="warning-issuer">
                              {t('admin.modIssuedBy')} {warning.issuedByUsername || warning.issuedBy}
                            </span>
                            {warning.expiresAt && (
                              <span className="warning-expires">
                                {t('admin.modExpires')} {formatDate(warning.expiresAt)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="empty-state">{t('admin.modNoWarnings')}</p>
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
                  {t('admin.modManageRestrictions')}
                </h3>

                <div className="custom-checkboxes">
                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={restrictions.canAddFriends !== false}
                      onChange={(e) => setRestrictions({ ...restrictions, canAddFriends: e.target.checked })}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">{t('admin.modCanAddFriends')}</span>
                  </label>

                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={restrictions.canAcceptFriends !== false}
                      onChange={(e) => setRestrictions({ ...restrictions, canAcceptFriends: e.target.checked })}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">{t('admin.modCanAcceptFriends')}</span>
                  </label>

                  <label className="custom-checkbox">
                    <input
                      type="checkbox"
                      checked={restrictions.canSendMessages !== false}
                      onChange={(e) => setRestrictions({ ...restrictions, canSendMessages: e.target.checked })}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">{t('admin.modCanSendMessages')}</span>
                  </label>

                  <label className="custom-checkbox danger">
                    <input
                      type="checkbox"
                      checked={restrictions.isBanned === true}
                      onChange={(e) => setRestrictions({ ...restrictions, isBanned: e.target.checked })}
                    />
                    <span className="checkbox-custom"></span>
                    <span className="checkbox-label">{t('admin.modBannedLabel')}</span>
                  </label>
                </div>

                <button
                  onClick={handleUpdateRestrictions}
                  disabled={loading}
                  className="update-restrictions-btn-new"
                >
                  {t('admin.modUpdateRestrictions')}
                </button>
              </div>

              {/* Active Restrictions */}
              {user.activeRestrictions && user.activeRestrictions.length > 0 && (
                <div className="active-restrictions-section">
                  <h3>{t('admin.modActiveRestrictions', { count: user.activeRestrictions.length })}</h3>
                  <div className="restrictions-list">
                    {user.activeRestrictions.map((restriction, index) => (
                      <div key={index} className="restriction-item">
                        <div className="restriction-type-badge">{restriction.type}</div>
                        <p className="restriction-reason">{restriction.reason}</p>
                        <div className="restriction-footer">
                          <span className="restriction-issuer">
                            {t('admin.modIssuedBy')} {restriction.issuedByUsername || restriction.issuedBy}
                          </span>
                          <span className="restriction-date">{formatDate(restriction.issuedAt)}</span>
                          {restriction.expiresAt && (
                            <span className="restriction-expires">{t('admin.modExpires')} {formatDate(restriction.expiresAt)}</span>
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
                    <h3>{t('admin.modResetPassword')}</h3>
                  </div>
                  {resetPassword ? (
                    <div className="password-reset-result">
                      <div className="password-display-new">
                        <div className="password-label">{t('admin.modNewPassword')}</div>
                        <div className="password-value">{resetPassword}</div>
                      </div>
                      <button onClick={copyPassword} className="copy-password-btn-new">
                        {t('admin.modCopyPassword')}
                      </button>
                      <p className="password-note-new">
                        {t('admin.modPasswordNote')}
                      </p>
                    </div>
                  ) : (
                    <button onClick={handleResetPassword} disabled={loading} className="action-btn reset">
                      <Key size={16} />
                      {t('admin.modDoReset')}
                    </button>
                  )}
                </div>

                <div className="action-card danger">
                  <div className="action-card-header">
                    <Ban size={20} />
                    <h3>{t('admin.modClearAll')}</h3>
                  </div>
                  <p className="action-description">
                    {t('admin.modClearDesc')}
                  </p>
                  <button onClick={handleClearRestrictions} disabled={loading} className="action-btn danger">
                    <Ban size={16} />
                    {t('admin.modClearBtn')}
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* BADGES TAB */}
          {activeTab === 'badges' && (
            <div className="tab-content">
              <div className="badges-management-section">
                <h3>
                  <Award size={20} />
                  {t('admin.modManageBadges')}
                </h3>
                <p className="badges-hint">{t('admin.modBadgesHint')}</p>
                <div className="badges-grid">
                  {BADGE_DEFS.map(badge => {
                    const active = localBadges.includes(badge.id);
                    return (
                      <button
                        key={badge.id}
                        className={`badge-toggle-btn ${active ? 'active' : ''}`}
                        style={{
                          '--badge-color': badge.color,
                          '--badge-bg': badge.bg
                        } as React.CSSProperties}
                        onClick={() => handleBadgeToggle(badge.id)}
                        disabled={badgesLoading}
                        title={active ? t('admin.badgeRevoke', { label: badge.label }) : t('admin.badgeGrant', { label: badge.label })}
                      >
                        <span className="badge-toggle-icon"><badge.Icon size={18} /></span>
                        <span className="badge-toggle-label">{badge.label}</span>
                        <span className="badge-toggle-status">{active ? '✓' : '+'}</span>
                      </button>
                    );
                  })}
                </div>
                {localBadges.length === 0 && (
                  <p className="empty-state">{t('admin.modNoBadges')}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
