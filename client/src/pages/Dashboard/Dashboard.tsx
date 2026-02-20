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

  const dashboardStyle: React.CSSProperties = user?.banner
    ? {
        backgroundImage: `url(${getImageUrl(user.banner)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }
    : {};

  return (
    <div className="dashboard" style={dashboardStyle}>
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
