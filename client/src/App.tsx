import { useEffect, useRef, useState } from 'react';
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
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finishLoading = () => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    setLoading(false);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (isAuthenticated && token) {
      setLoading(true);

      // Safety timeout — if loading takes > 8s, give up and show auth
      loadingTimeoutRef.current = setTimeout(() => {
        console.error('Loading timeout - forcing logout');
        logout();
        setLoading(false);
        loadingTimeoutRef.current = null;
      }, 8000);

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
          // Connect socket — wrapped so a socket error doesn't block loading
          try {
            socketService.connect(token);

            socketService.on('user:updated', (updatedUser: any) => {
              if (updatedUser) setUser(updatedUser);
            });

            socketService.on('dm:new', (dm: any) => {
              const notifEnabled = localStorage.getItem('dmx-desktop-notifications') !== 'false';
              if (!notifEnabled) return;
              const state = useStore.getState();
              if (dm.senderId === state.user?.id) return;
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
          } catch (socketErr) {
            console.error('Socket connect error (non-fatal):', socketErr);
          }

          // Short delay for smooth transition, then always resolve loading
          setTimeout(() => finishLoading(), 400);
        })
        .catch((error) => {
          console.error('App initialization error:', error);
          logout();
          finishLoading();
        });

      return () => {
        socketService.off('user:updated');
        socketService.off('dm:new');
        socketService.off('friend:request');
        socketService.disconnect();
        // NOTE: intentionally NOT clearing loadingTimeoutRef here,
        // so the safety timeout always fires even if the effect re-runs.
      };
    } else {
      finishLoading();
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
