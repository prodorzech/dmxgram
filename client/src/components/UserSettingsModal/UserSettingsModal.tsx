import { useState, useRef } from 'react';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { X, User as UserIcon, Upload, Moon, Sun, Globe, AlertTriangle } from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';
import { languages } from '../../i18n';
import { useTranslation } from 'react-i18next';
import './UserSettingsModal.css';

interface UserSettingsModalProps {
  onClose: () => void;
}

export function UserSettingsModal({ onClose }: UserSettingsModalProps) {
  const { user, token, setUser, theme, toggleTheme } = useStore();
  const { i18n, t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'profile' | 'account'>('profile');
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.customStatus || '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar || '');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState(user?.banner || '');
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

      const updatedUser = await api.updateProfile(
        username !== user.username ? username : undefined,
        avatarUrl !== user.avatar ? avatarUrl : undefined,
        bannerUrl !== user.banner ? bannerUrl : undefined,
        bio !== user.bio ? bio : undefined,
        token!
      );
      
      // Update custom status separately if changed
      let finalUser = updatedUser;
      if (customStatus !== user.customStatus) {
        finalUser = await api.updateCustomStatus(customStatus, token!);
      }
      
      setUser(finalUser);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Nie udało się zaktualizować profilu');
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

            <div className="form-group">
              <label htmlFor="banner">
                <Upload size={16} />
                {t('user.banner')}
              </label>
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
          </div>
          </>)}

          {activeTab === 'account' && (<>
            <div className="account-status-section">
              <h3>{t('user.accountStatus')}</h3>
              
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
