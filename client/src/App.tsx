import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Auth } from './components/Auth/Auth';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { LoadingScreen } from './components/LoadingScreen/LoadingScreen';
import { UpdateNotification } from './components/UpdateNotification/UpdateNotification';
import { api } from './services/api';
import { socketService } from './services/socket';
import i18n from './i18n';
import './styles/globals.css';

function App() {
  const { isAuthenticated, token, setUser, setFriends, theme, logout } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (isAuthenticated && token) {
      setLoading(true);
      
      // Set timeout to prevent infinite loading
      const loadingTimeout = setTimeout(() => {
        console.error('Loading timeout - forcing logout');
        logout();
        setLoading(false);
      }, 10000); // 10 seconds timeout
      
      // Fetch user data
      Promise.all([
        api.getMe(token).then(setUser).catch(err => {
          console.error('Failed to fetch user:', err);
          throw err;
        }),
        api.getFriends(token).then(setFriends).catch(err => {
          console.error('Failed to fetch friends:', err);
          throw err;
        })
      ])
        .then(() => {
          // Connect socket
          socketService.connect(token);

          // When admin updates this user's restrictions/warnings, refresh state
          socketService.on('user:updated', (updatedUser: any) => {
            if (updatedUser) setUser(updatedUser);
          });

          // Desktop notifications
          socketService.on('dm:new', (dm: any) => {
            const notifEnabled = localStorage.getItem('dmx-desktop-notifications') !== 'false';
            if (!notifEnabled) return;
            const state = useStore.getState();
            if (dm.senderId === state.user?.id) return; // own message
            // Suppress only when actively viewing that chat with focus
            if (state.currentFriend?.id === dm.senderId && document.hasFocus()) return;
            const raw: string = dm.content ?? '';
            let preview = raw;
            try {
              const parsed = JSON.parse(raw);
              preview = parsed.text || (parsed.attachments?.length ? '\uD83D\uDCCE Attachment' : raw);
            } catch { /* not JSON */ }
            if (!preview.trim()) return;
            window.electronAPI?.showNotification({
              title: dm.senderUsername,
              body: preview.length > 80 ? preview.substring(0, 80) + '\u2026' : preview,
            });
          });

          socketService.on('friend:request', (request: any) => {
            const notifEnabled = localStorage.getItem('dmx-desktop-notifications') !== 'false';
            if (!notifEnabled) return;
            window.electronAPI?.showNotification({
              title: 'DMXGram',
              body: i18n.t('user.notifFriendRequest', { username: request.senderUsername }),
            });
          });

          // Add a small delay for smooth transition
          setTimeout(() => {
            clearTimeout(loadingTimeout);
            setLoading(false);
          }, 500);
        })
        .catch((error) => {
          console.error('App initialization error:', error);
          clearTimeout(loadingTimeout);
          logout();
          setLoading(false);
        });

      return () => {
        clearTimeout(loadingTimeout);
        socketService.off('user:updated');
        socketService.off('dm:new');
        socketService.off('friend:request');
        socketService.disconnect();
      };
    } else {
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  if (loading) {
    return <LoadingScreen message={isAuthenticated ? 'Loading data' : 'Initializing'} />;
  }

  if (!isAuthenticated) {
    return <Auth />;
  }

  return (
    <>
      <UpdateNotification />
      <Dashboard />
    </>
  );
}

export default App;
