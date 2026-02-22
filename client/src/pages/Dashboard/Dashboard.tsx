import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { FriendsList } from '../../components/FriendsList/FriendsList';
import { DMChat } from '../../components/DMChat/DMChat';
import { UserPanel } from '../../components/UserPanel/UserPanel';
import { UserSettingsModal } from '../../components/UserSettingsModal/UserSettingsModal';
import { AdminPanel } from '../../components/AdminPanel/AdminPanel';
import { ChangePasswordModal } from '../../components/ChangePasswordModal/ChangePasswordModal';
import { getImageUrl } from '../../utils/imageUrl';
import './Dashboard.css';

export function Dashboard() {
  const { t } = useTranslation();
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const { user, setUser, currentFriend } = useStore();

  // Apply background blur CSS variable from localStorage on mount + live updates
  useEffect(() => {
    const applyBlur = () => {
      const v = parseInt(localStorage.getItem('dmx-bg-blur') ?? '0', 10);
      document.documentElement.style.setProperty('--bg-blur', `${(v / 100) * 20}px`);
      // 0% blur = fully transparent panels (opacity 0)
      // 100% blur = more opaque panels (opacity 0.95)
      const panelOpacity = ((v / 100) * 0.95).toFixed(2);
      document.documentElement.style.setProperty('--panel-opacity', panelOpacity);
    };
    applyBlur();
    window.addEventListener('dmx-blur-changed', applyBlur);
    return () => window.removeEventListener('dmx-blur-changed', applyBlur);
  }, []);

  // Restore accent colour from localStorage on mount
  useEffect(() => {
    const accent = localStorage.getItem('dmx-accent-color');
    if (accent) {
      // Find matching hover colour
      const ACCENT_MAP: Record<string, { hover: string }> = {
        '#dc2626': { hover: '#b91c1c' },
        '#ec4899': { hover: '#db2777' },
        '#3b82f6': { hover: '#2563eb' },
        '#22c55e': { hover: '#16a34a' },
        '#f97316': { hover: '#ea580c' },
        '#eab308': { hover: '#ca8a04' },
        '#a855f7': { hover: '#9333ea' },
      };
      const meta = ACCENT_MAP[accent];
      document.documentElement.style.setProperty('--accent-primary', accent);
      if (meta) {
        document.documentElement.style.setProperty('--accent-hover',  meta.hover);
        document.documentElement.style.setProperty('--accent-active', meta.hover);
      }
    }
  }, []);

  // No-background toggle — live updates from settings
  const [noBg, setNoBg] = useState(() => localStorage.getItem('dmx-no-bg') === 'true');
  useEffect(() => {
    const handler = (e: Event) => {
      setNoBg((e as CustomEvent).detail?.noBg ?? false);
    };
    window.addEventListener('dmx-nobg-changed', handler);
    return () => window.removeEventListener('dmx-nobg-changed', handler);
  }, []);

  // Check if user needs to change password
  useEffect(() => {
    if (user?.mustChangePassword) {
      setShowChangePassword(true);
    }
  }, [user?.mustChangePassword]);

  const handlePasswordChanged = async () => {
    // Refresh user data after password change
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await fetch('http://localhost:3001/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const updatedUser = await response.json();
          setUser(updatedUser);
        }
      } catch (error) {
        console.error('Error refreshing user:', error);
      }
    }
    setShowChangePassword(false);
  };

  const bannerUrl = user?.banner ? getImageUrl(user.banner) : null;
  const isGif = bannerUrl ? bannerUrl.toLowerCase().includes('.gif') : false;
  // Effective banner: hidden when noBg is set
  const effectiveBanner = noBg ? null : bannerUrl;

  return (
    <div className="dashboard">
      {/* Blurred background layer — always rendered; uses banner if set, otherwise a subtle gradient */}
      {effectiveBanner && isGif ? (
        <img
          className="dashboard-bg dashboard-bg-gif"
          src={effectiveBanner}
          alt=""
          aria-hidden="true"
        />
      ) : (
        <div
          className="dashboard-bg"
          style={effectiveBanner
            ? { backgroundImage: `url(${effectiveBanner})` }
            : { background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }
          }
        />
      )}
      <div className="dashboard-overlay" data-chat-open={!!currentFriend ? 'true' : 'false'}>
        {showAdminPanel ? (
          <AdminPanel />
        ) : (
          <>
            <div className="dashboard-sidebar">
              <FriendsList />
              <UserPanel 
                onSettingsClick={() => setShowUserSettings(true)}
                onAdminClick={() => setShowAdminPanel(true)}
              />
            </div>
            <DMChat />
          </>
        )}
        {showUserSettings && (
          <UserSettingsModal onClose={() => setShowUserSettings(false)} />
        )}
        {showAdminPanel && (
          <button 
            className="close-admin-btn"
            onClick={() => setShowAdminPanel(false)}
          >
            {t('dashboard.closeAdminPanel')}
          </button>
        )}
        {showChangePassword && (
          <ChangePasswordModal
            isForced={user?.mustChangePassword}
            onClose={() => !user?.mustChangePassword && setShowChangePassword(false)}
            onSuccess={handlePasswordChanged}
          />
        )}
      </div>
    </div>
  );
}
