import { useState, useRef } from 'react';
import { useStore } from '../../store';
import { api } from '../../services/api';
import {
  X, User as UserIcon, Upload, Moon, Sun, Globe, AlertTriangle, Layers, Bell,
  Palette, ImageOff, CheckCircle2, Ban, Shield, Calendar, Mail, Star
} from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';
import { languages } from '../../i18n';
import { useTranslation } from 'react-i18next';
import './UserSettingsModal.css';

// ── Accent colours palette ────────────────────────────────────────────────────
const ACCENT_COLORS = [
  { label: 'Czerwony',  value: '#dc2626', hover: '#b91c1c', shadow: 'rgba(220,38,38,0.35)'  },
  { label: 'Różowy',    value: '#ec4899', hover: '#db2777', shadow: 'rgba(236,72,153,0.35)'  },
  { label: 'Niebieski', value: '#3b82f6', hover: '#2563eb', shadow: 'rgba(59,130,246,0.35)'  },
  { label: 'Zielony',   value: '#22c55e', hover: '#16a34a', shadow: 'rgba(34,197,94,0.35)'   },
  { label: 'Pomarańcz', value: '#f97316', hover: '#ea580c', shadow: 'rgba(249,115,22,0.35)'  },
  { label: 'Żółty',     value: '#eab308', hover: '#ca8a04', shadow: 'rgba(234,179,8,0.35)'   },
  { label: 'Fioletowy', value: '#a855f7', hover: '#9333ea', shadow: 'rgba(168,85,247,0.35)'  },
];

interface UserSettingsModalProps {
  onClose: () => void;
}

export function UserSettingsModal({ onClose }: UserSettingsModalProps) {
  const { user, token, setUser, theme, toggleTheme } = useStore();
  const { i18n, t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'account'>('profile');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.customStatus || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState(user?.banner || '');
  const [bgBlur, setBgBlur] = useState<number>(() =>
    parseInt(localStorage.getItem('dmx-bg-blur') ?? '0', 10)
  );
  const [desktopNotif, setDesktopNotif] = useState<boolean>(
    () => localStorage.getItem('dmx-desktop-notifications') !== 'false'
  );
  const [accentColor, setAccentColor] = useState<string>(
    () => localStorage.getItem('dmx-accent-color') || '#dc2626'
  );
  const [noBg, setNoBg] = useState<boolean>(
    () => localStorage.getItem('dmx-no-bg') === 'true'
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError(t('upload.avatarTooLarge'));
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError(t('upload.bannerTooLarge'));
        return;
      }
      setBannerFile(file);
      setBannerPreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleBgBlurChange = (value: number) => {
    setBgBlur(value);
    localStorage.setItem('dmx-bg-blur', value.toString());
    document.documentElement.style.setProperty('--bg-blur', `${(value / 100) * 20}px`);
    // 0% blur = fully transparent panels (opacity 0)
    // 100% blur = more opaque panels (opacity 0.95)
    const panelOpacity = ((value / 100) * 0.95).toFixed(2);
    document.documentElement.style.setProperty('--panel-opacity', panelOpacity);
    window.dispatchEvent(new CustomEvent('dmx-blur-changed'));
  };

  const handleDesktopNotifToggle = () => {
    const next = !desktopNotif;
    setDesktopNotif(next);
    localStorage.setItem('dmx-desktop-notifications', next.toString());
  };

  const handleAccentChange = (color: typeof ACCENT_COLORS[0]) => {
    setAccentColor(color.value);
    localStorage.setItem('dmx-accent-color', color.value);
    document.documentElement.style.setProperty('--accent-primary', color.value);
    document.documentElement.style.setProperty('--accent-hover',   color.hover);
    document.documentElement.style.setProperty('--accent-active',  color.hover);
    document.documentElement.style.setProperty('--accent-shadow',  color.shadow);
  };

  const handleNoBgToggle = () => {
    const next = !noBg;
    setNoBg(next);
    localStorage.setItem('dmx-no-bg', next.toString());
    window.dispatchEvent(new CustomEvent('dmx-nobg-changed', { detail: { noBg: next } }));
  };

  const handleLanguageChange = async (languageCode: string) => {
    if (!token) return;
    
    try {
      // First update the language in backend
      await api.updateLanguage(languageCode, token);
      // Then change i18n language which will trigger UI update
      await i18n.changeLanguage(languageCode);
      // Update localStorage
      localStorage.setItem('i18nextLng', languageCode);
      // Force re-render by updating user
      const updatedUser = await api.getMe(token);
      setUser(updatedUser);
    } catch (err) {
      console.error('Failed to update language:', err);
      setError('Failed to change language');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let avatarUrl = user.avatar;
      let bannerUrl = user.banner;

      // Upload avatar if file was selected
      if (avatarFile) {
        const uploadResponse = await api.uploadAvatar(avatarFile, token!);
        avatarUrl = uploadResponse.url;
      }

      // Upload banner if file was selected
      if (bannerFile) {
        const uploadResponse = await api.uploadBanner(bannerFile, token!);
        bannerUrl = uploadResponse.url;
      }

      const usernameChanged = username !== user.username;
      const avatarChanged = avatarUrl !== user.avatar;
      const bannerChanged = bannerUrl !== user.banner;
      const bioChanged = bio !== user.bio;
      const statusChanged = customStatus !== user.customStatus;

      let finalUser = user;

      // Only call updateProfile if at least one profile field changed
      if (usernameChanged || avatarChanged || bannerChanged || bioChanged) {
        const updatedUser = await api.updateProfile(
          usernameChanged ? username : undefined,
          avatarChanged ? avatarUrl : undefined,
          bannerChanged ? bannerUrl : undefined,
          bioChanged ? bio : undefined,
          token!
        );
        finalUser = updatedUser;
      }

      // Update custom status separately if changed
      if (statusChanged) {
        finalUser = await api.updateCustomStatus(customStatus, token!);
      }

      setUser(finalUser);
      onClose();
    } catch (err: any) {
      setError(err.message || t('errors.updateProfile'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="user-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('user.settings')}</h2>
          <button className="close-button" onClick={onClose}>
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          <button
            className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <UserIcon size={18} />
            {t('user.profile')}
          </button>
          <button
            className={`tab-button ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <Layers size={18} />
            {t('user.appearance')}
          </button>
          <button
            className={`tab-button ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            <AlertTriangle size={18} />
            {t('user.accountStatus')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="settings-form">
          {activeTab === 'profile' && (
          <>
          <div className="settings-section">
            <h3>{t('user.profile')}</h3>
            
            <div className="form-group">
              <label htmlFor="username">
                <UserIcon size={16} />
                {t('user.username')}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('user.username')}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="bio">{t('user.bio')}</label>
              <textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder={t('user.bioPlaceholder')}
                rows={3}
                maxLength={200}
                disabled={loading}
              />
              <span className="char-count">{bio.length}/200</span>
            </div>

            <div className="form-group">
              <label htmlFor="customStatus">{t('user.customStatus')}</label>
              <input
                id="customStatus"
                type="text"
                value={customStatus}
                onChange={(e) => setCustomStatus(e.target.value)}
                placeholder={t('user.customStatusPlaceholder')}
                maxLength={100}
                disabled={loading}
              />
              <span className="char-count">{customStatus.length}/100</span>
            </div>

            <div className="form-group">
              <label htmlFor="avatar">
                <Upload size={16} />
                {t('user.avatar')}
              </label>
              <div className="avatar-upload-container">
                {avatarPreview && (
                  <div className="avatar-preview">
                    <img src={getImageUrl(avatarPreview)} alt="Avatar preview" onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }} />
                  </div>
                )}
                <input
                  ref={avatarFileInputRef}
                  id="avatar"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleAvatarChange}
                  disabled={loading}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="upload-button"
                  onClick={() => avatarFileInputRef.current?.click()}
                  disabled={loading}
                >
                  <Upload size={18} />
                  {avatarFile ? t('user.changeFile') : t('user.selectFile')}
                </button>
                {avatarFile && (
                  <span className="file-name">{avatarFile.name}</span>
                )}
                <span className="upload-hint">{t('upload.avatarHint')}</span>
              </div>
            </div>
          </div>
          </>)}

          {activeTab === 'appearance' && (
          <>
          <div className="settings-section">
            <h3>{t('user.banner')}</h3>

            <div className="form-group">
              <div className="banner-upload-container">
                {bannerPreview && (
                  <div className="banner-preview">
                    <img src={getImageUrl(bannerPreview)} alt="Banner preview" onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }} />
                  </div>
                )}
                <input
                  ref={bannerFileInputRef}
                  id="banner"
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  onChange={handleBannerChange}
                  disabled={loading}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  className="upload-button"
                  onClick={() => bannerFileInputRef.current?.click()}
                  disabled={loading}
                >
                  <Upload size={18} />
                  {bannerFile ? t('user.changeFile') : t('user.selectFile')}
                </button>
                {bannerFile && (
                  <span className="file-name">{bannerFile.name}</span>
                )}
                <span className="upload-hint">{t('upload.bannerHint')}</span>
              </div>
            </div>

            {/* Background blur slider + live preview */}
            <div className="form-group">
              <label>
                <Layers size={16} />
                {t('user.bgBlur')} — {bgBlur}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={bgBlur}
                onChange={(e) => handleBgBlurChange(parseInt(e.target.value, 10))}
                className="volume-slider"
              />
              <div className="volume-labels">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <small style={{ color: 'var(--text-muted)', marginTop: 4 }}>{t('user.bgBlurHint')}</small>
            </div>

            {/* Blur preview */}
            <div className="blur-preview-container">
              <div
                className="blur-preview-bg"
                style={{
                  backgroundImage: bannerPreview
                    ? `url(${getImageUrl(bannerPreview)})`
                    : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                  filter: `blur(${(bgBlur / 100) * 20}px)`,
                  transform: 'scale(1.08)',
                }}
              />
              <div className="blur-preview-overlay">
                <div className="blur-preview-msg blur-preview-msg--received">
                  <div className="blur-preview-avatar">A</div>
                  <div className="blur-preview-bubble blur-preview-bubble--received">Hey, how are you? 👋</div>
                </div>
                <div className="blur-preview-msg blur-preview-msg--sent">
                  <div className="blur-preview-bubble blur-preview-bubble--sent">I'm good! Check out my background 😄</div>
                </div>
                <div className="blur-preview-msg blur-preview-msg--received">
                  <div className="blur-preview-avatar">A</div>
                  <div className="blur-preview-bubble blur-preview-bubble--received">Looks great! 🔥</div>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>{t('user.settings_title')}</h3>
            
            <div className="form-group">
              <label>
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                {t('user.theme')}
              </label>
              <div className="theme-selector">
                <button
                  type="button"
                  className={`theme-button ${theme === 'dark' ? 'active' : ''}`}
                  onClick={toggleTheme}
                  disabled={loading}
                >
                  <Moon size={18} />
                  <span>{t('user.dark')}</span>
                </button>
                <button
                  type="button"
                  className={`theme-button ${theme === 'light' ? 'active' : ''}`}
                  onClick={toggleTheme}
                  disabled={loading}
                >
                  <Sun size={18} />
                  <span>{t('user.light')}</span>
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>
                <Globe size={16} />
                {t('user.language')}
              </label>
              <div className="language-selector">
                {languages.map(lang => (
                  <button
                    key={lang.code}
                    type="button"
                    className={`language-button ${i18n.language === lang.code ? 'active' : ''}`}
                    onClick={() => handleLanguageChange(lang.code)}
                    disabled={loading}
                  >
                    <span className="language-flag">{lang.flag}</span>
                    <span className="language-name">{lang.nativeName}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop notifications toggle */}
            <div className="form-group">
              <label>
                <Bell size={16} />
                {t('user.desktopNotifications')}
              </label>
              <div className="notif-toggle-row">
                <small style={{ color: 'var(--text-muted)' }}>{t('user.desktopNotificationsHint')}</small>
                <button
                  type="button"
                  className={`notif-toggle-btn ${desktopNotif ? 'active' : ''}`}
                  onClick={handleDesktopNotifToggle}
                  disabled={loading}
                >
                  {desktopNotif ? t('user.notifEnabled') : t('user.notifDisabled')}
                </button>
              </div>
            </div>

            {/* Accent colour picker */}
            <div className="form-group">
              <label>
                <Palette size={16} />
                {t('user.accentColor')}
              </label>
              <div className="accent-colors-grid">
                {ACCENT_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    className={`accent-color-swatch${accentColor === c.value ? ' selected' : ''}`}
                    style={{ '--swatch-color': c.value, '--swatch-shadow': c.shadow } as React.CSSProperties}
                    onClick={() => handleAccentChange(c)}
                  />
                ))}
              </div>
              <small style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                {t('user.accentColorHint')}
              </small>
            </div>

            {/* Remove background */}
            <div className="form-group">
              <label>
                <ImageOff size={16} />
                {t('user.bgTitle')}
              </label>
              <div className="notif-toggle-row">
                <small style={{ color: 'var(--text-muted)' }}>
                  {noBg ? t('user.bgDisabled') : t('user.bgEnabled')}
                </small>
                <button
                  type="button"
                  className={`notif-toggle-btn ${noBg ? 'active' : ''}`}
                  onClick={handleNoBgToggle}
                  disabled={loading}
                >
                  {noBg ? t('user.restoreBg') : t('user.removeBg')}
                </button>
              </div>
            </div>

          </div>
          </>)}

          {activeTab === 'account' && (<>
            <div className="account-status-section">
              <h3>{t('user.accountStatus')}</h3>

              {/* ── Account overview card ─────────────────────────── */}
              {(() => {
                const isBanned = user.restrictions?.isBanned;
                const hasActiveRestrictions = user.activeRestrictions && user.activeRestrictions.length > 0;
                const hasWarnings = user.warnings && user.warnings.length > 0;
                const isGood = !isBanned && !hasActiveRestrictions;
                const joinDate = user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long', day: 'numeric' })
                  : '—';
                const maskedEmail = user.email
                  ? (() => {
                      const [local, domain] = user.email.split('@');
                      const masked = local.length > 3
                        ? local[0] + '•'.repeat(local.length - 2) + local[local.length - 1]
                        : local[0] + '•'.repeat(local.length - 1);
                      return `${masked}@${domain}`;
                    })()
                  : '—';
                return (
                  <div className={`account-overview-card ${isBanned ? 'banned' : isGood ? 'good' : 'restricted'}`}>
                    <div className="account-overview-icon">
                      {isBanned    ? <Ban size={36} />        :
                       isGood      ? <CheckCircle2 size={36} /> :
                                   <Shield size={36} />}
                    </div>
                    <div className="account-overview-info">
                      <div className="account-overview-status">
                      {isBanned              ? t('user.accountBanned')     :
                       hasActiveRestrictions  ? t('user.accountRestricted') :
                       hasWarnings            ? t('user.accountWarnings')   :
                                               t('user.accountGood')}
                      </div>
                      <div className="account-overview-meta">
                        <span><Calendar size={13} /> {t('user.accountJoined')}: {joinDate}</span>
                        <span><Mail size={13} /> {maskedEmail}</span>
                        {user.badges && user.badges.length > 0 && (
                          <span><Star size={13} /> {t('user.accountBadgesCount', { count: user.badges.length })}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Account Restrictions Status */}
              <div className="restrictions-status">
                <h4>{t('user.currentRestrictions')}</h4>
                {user.restrictions ? (
                  <div className="restrictions-grid">
                    <div className={`restriction-item ${!user.restrictions.canAddFriends ? 'restricted' : 'allowed'}`}>
                      <span className="restriction-label">{t('user.canAddFriends')}:</span>
                      <span className="restriction-value">{user.restrictions.canAddFriends ? t('user.yes') : t('user.no')}</span>
                    </div>
                    <div className={`restriction-item ${!user.restrictions.canAcceptFriends ? 'restricted' : 'allowed'}`}>
                      <span className="restriction-label">{t('user.canAcceptFriends')}:</span>
                      <span className="restriction-value">{user.restrictions.canAcceptFriends ? t('user.yes') : t('user.no')}</span>
                    </div>
                    <div className={`restriction-item ${!user.restrictions.canSendMessages ? 'restricted' : 'allowed'}`}>
                      <span className="restriction-label">{t('user.canSendMessages')}:</span>
                      <span className="restriction-value">{user.restrictions.canSendMessages ? t('user.yes') : t('user.no')}</span>
                    </div>
                    <div className={`restriction-item ${user.restrictions.isBanned ? 'restricted' : 'allowed'}`}>
                      <span className="restriction-label">{t('user.isBanned')}:</span>
                      <span className="restriction-value">{user.restrictions.isBanned ? t('user.yes') : t('user.no')}</span>
                    </div>
                  </div>
                ) : (
                  <p className="no-restrictions">{t('user.noRestrictionsData')}</p>
                )}
              </div>

              {/* Active Restrictions */}
              {user.activeRestrictions && user.activeRestrictions.length > 0 && (
                <div className="active-restrictions">
                  <h4>{t('user.activeRestrictions')}</h4>
                  <div className="restrictions-list">
                    {user.activeRestrictions.map((restriction, index) => (
                      <div key={index} className={`restriction-card ${restriction.type}`}>
                        <div className="restriction-header">
                          <span className="restriction-type">{t(`user.${restriction.type}`)}</span>
                          {restriction.category && (
                            <span className="restriction-category">{restriction.category}</span>
                          )}
                        </div>
                        <div className="restriction-details">
                          <p><strong>{t('user.reason')}:</strong> {restriction.reason}</p>
                          <p><strong>{t('user.issuedBy')}:</strong> {restriction.issuedByUsername || restriction.issuedBy}</p>
                          <p><strong>{t('user.issuedAt')}:</strong> {new Date(restriction.issuedAt).toLocaleString(i18n.language)}</p>
                          {restriction.expiresAt ? (
                            <p><strong>{t('user.expiresAt')}:</strong> {new Date(restriction.expiresAt).toLocaleString(i18n.language)}</p>
                          ) : (
                            <p><strong>{t('user.duration')}:</strong> {t('user.permanent')}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warnings History */}
              <div className="warnings-section">
                <h4>{t('user.warningHistory')}</h4>
                {user.warnings && user.warnings.length > 0 ? (
                  <div className="warnings-list">
                    {user.warnings.map((warning, index) => (
                      <div key={index} className="warning-card">
                        <div className="warning-header">
                          <span className="warning-type">{t(`user.${warning.type}`)}</span>
                          {warning.category && (
                            <span className="warning-category">{warning.category}</span>
                          )}
                        </div>
                        <div className="warning-details">
                          <p><strong>{t('user.reason')}:</strong> {warning.reason}</p>
                          <p><strong>{t('user.issuedBy')}:</strong> {warning.issuedByUsername || warning.issuedBy}</p>
                          <p><strong>{t('user.issuedAt')}:</strong> {new Date(warning.issuedAt).toLocaleString(i18n.language)}</p>
                          {warning.expiresAt && (
                            <p><strong>{t('user.expiresAt')}:</strong> {new Date(warning.expiresAt).toLocaleString(i18n.language)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-warnings">{t('user.noWarnings')}</p>
                )}
              </div>
            </div>
          </>)}

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button" disabled={loading}>
              {t('user.cancel')}
            </button>
            <button type="submit" className="save-button" disabled={loading}>
              {loading ? t('user.saving') : t('user.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
