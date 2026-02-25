import { useEffect, useState, Component, ReactNode, ErrorInfo } from 'react';
import { useStore } from './store';
import { Auth } from './components/Auth/Auth';
import { Dashboard } from './pages/Dashboard/Dashboard';
import { LoadingScreen } from './components/LoadingScreen/LoadingScreen';
import { UpdateNotification } from './components/UpdateNotification/UpdateNotification';
import { TitleBar } from './components/TitleBar/TitleBar';
import { api } from './services/api';
import { socketService } from './services/socket';
import i18n from './i18n';
import './styles/globals.css';

// ── Error boundary — catches crashes and shows error message instead of white screen ──
interface EBState { hasError: boolean; error: string; }
class AppErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(err: Error): EBState {
    return { hasError: true, error: err?.message || String(err) };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[AppErrorBoundary]', err, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#0f0f0f', color: '#fff',
          fontFamily: 'sans-serif', padding: '2rem', boxSizing: 'border-box',
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>DMXGram – błąd renderowania</h2>
          <p style={{ color: '#aaa', marginBottom: '1.5rem', textAlign: 'center' }}>
            Wystąpił nieoczekiwany błąd. Spróbuj ponownie uruchomić aplikację.
          </p>
          <pre style={{ background: '#1a1a1a', padding: '1rem', borderRadius: '8px', color: '#f87171', maxWidth: '100%', overflowX: 'auto', fontSize: '0.75rem' }}>
            {this.state.error}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '1.5rem', padding: '0.6rem 1.5rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Odśwież
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const { isAuthenticated, token, setUser, setFriends, theme, logout } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    // Per-invocation cancelled flag — prevents stale setState after cleanup
    let cancelled = false;

    const done = () => {
      if (!cancelled) setLoading(false);
    };

    // ── No session: show auth immediately ──────────────────────────────────
    if (!isAuthenticated || !token) {
      done();
      return () => { cancelled = true; };
    }

    // ── Has session: fetch user data ───────────────────────────────────────
    setLoading(true);

    // Nuclear fallback — ALWAYS resolves loading after 8s no matter what
    const safetyTimer = setTimeout(() => {
      console.warn('App init safety timeout fired');
      try { logout(); } catch (_) {}
      done();
    }, 8000);

    Promise.all([
      api.getMe(token).then(setUser),
      api.getFriends(token).then(setFriends),
    ])
      .then(() => {
        clearTimeout(safetyTimer);
        // Connect socket — errors here are non-fatal
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

        done();
      })
      .catch((error: any) => {
        clearTimeout(safetyTimer);
        console.error('App initialization error:', error);
        try { logout(); } catch (_) {}
        done();
      });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      socketService.off('user:updated');
      socketService.off('dm:new');
      socketService.off('friend:request');
      socketService.disconnect();
    };
  }, [isAuthenticated, token]);

  if (loading) {
    return (
      <>
        <TitleBar />
        <LoadingScreen message={isAuthenticated ? 'Loading...' : 'Loading...'} />
      </>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <TitleBar />
        <Auth />
      </>
    );
  }

  return (
    <>
      <TitleBar />
      <UpdateNotification />
      <Dashboard />
    </>
  );
}

function AppRoot() {
  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}

export default AppRoot;
