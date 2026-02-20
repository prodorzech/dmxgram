import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Auth } from './components/Auth/Auth';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { LoadingScreen } from './components/LoadingScreen/LoadingScreen';
import { UpdateNotification } from './components/UpdateNotification/UpdateNotification';
import { api } from './services/api';
import { socketService } from './services/socket';
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
