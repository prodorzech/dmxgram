import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { FriendsList } from '../../components/FriendsList/FriendsList';
import { ServerList } from '../../components/ServerList/ServerList';
import { ServerChannels } from '../../components/ServerChannels/ServerChannels';
import { ServerChat } from '../../components/ServerChat/ServerChat';
import { DMChat } from '../../components/DMChat/DMChat';
import { UserPanel } from '../../components/UserPanel/UserPanel';
import { UserSettingsModal } from '../../components/UserSettingsModal/UserSettingsModal';
import { AdminPanel } from '../../components/AdminPanel/AdminPanel';
import { ChangePasswordModal } from '../../components/ChangePasswordModal/ChangePasswordModal';
import { CallOverlay } from '../../components/CallOverlay/CallOverlay';
import './Dashboard.css';

export function Dashboard() {
  const { t } = useTranslation();
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const { user, setUser, currentFriend, currentServer, currentChannel } = useStore();

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
      // Find matching hover/shadow colour
      const ACCENT_MAP: Record<string, { hover: string; shadow: string }> = {
        '#dc2626': { hover: '#b91c1c', shadow: 'rgba(220,38,38,0.35)'  },
        '#ec4899': { hover: '#db2777', shadow: 'rgba(236,72,153,0.35)' },
        '#3b82f6': { hover: '#2563eb', shadow: 'rgba(59,130,246,0.35)' },
        '#22c55e': { hover: '#16a34a', shadow: 'rgba(34,197,94,0.35)'  },
        '#f97316': { hover: '#ea580c', shadow: 'rgba(249,115,22,0.35)' },
        '#eab308': { hover: '#ca8a04', shadow: 'rgba(234,179,8,0.35)'  },
        '#a855f7': { hover: '#9333ea', shadow: 'rgba(168,85,247,0.35)' },
      };
      const meta = ACCENT_MAP[accent];
      document.documentElement.style.setProperty('--accent-primary', accent);
      if (meta) {
        document.documentElement.style.setProperty('--accent-hover',   meta.hover);
        document.documentElement.style.setProperty('--accent-active',  meta.hover);
        document.documentElement.style.setProperty('--accent-shadow',  meta.shadow);
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

  // Custom background image — stored as data URL in localStorage
  const [customBg, setCustomBg] = useState(() => localStorage.getItem('dmx-custom-bg') || '');
  useEffect(() => {
    const handler = (e: Event) => {
      setCustomBg((e as CustomEvent).detail?.customBg ?? '');
    };
    window.addEventListener('dmx-bg-changed', handler);
    return () => window.removeEventListener('dmx-bg-changed', handler);
  }, []);

  // Check if user needs to change password
  useEffect(() => {
    if (user?.mustChangePassword) {
      setShowChangePassword(true);
    }
  }, [user?.mustChangePassword]);

  // Listen for "change password" request from settings modal
  useEffect(() => {
    const handler = () => setShowChangePassword(true);
    window.addEventListener('dmx-open-change-password', handler);
    return () => window.removeEventListener('dmx-open-change-password', handler);
  }, []);

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

  return (
    <div className="dashboard">
      {/* Blurred background layer — custom image or gradient; profile banner is in user info popover */}
      {!noBg && (
        customBg ? (
          <div
            className="dashboard-bg"
            style={{ backgroundImage: `url(${customBg})` }}
          />
        ) : (
          <div
            className="dashboard-bg"
            style={{ background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' }}
          />
        )
      )}
      <div className="dashboard-overlay" data-chat-open={!!currentFriend || !!currentChannel ? 'true' : 'false'}>
        {showAdminPanel ? (
          <AdminPanel />
        ) : (
          <>
            <div className="dashboard-sidebar">
              <div className="sidebar-top">
                <ServerList />
                <div className="sidebar-divider" />
                <FriendsList />
              </div>
              <UserPanel 
                onSettingsClick={() => setShowUserSettings(true)}
                onAdminClick={() => setShowAdminPanel(true)}
              />
            </div>
            {currentServer && (
              <ServerChannels />
            )}
            {currentServer && currentChannel ? (
              <ServerChat />
            ) : (
              <DMChat />
            )}
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
      <CallOverlay />
    </div>
  );
}
