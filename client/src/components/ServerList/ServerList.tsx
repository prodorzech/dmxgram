import { useEffect, useState } from 'react';
import { Plus, Settings, LogOut, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { api } from '../../services/api';
import './ServerList.css';

interface ServerListProps {
  onServerSelect?: () => void;
}

export function ServerList({ onServerSelect }: ServerListProps) {
  const { t } = useTranslation();
  const { servers, setServers, setCurrentServer, currentServer, token, user } = useStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [serverName, setServerName] = useState('');
  const [serverDesc, setServerDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState<string | null>(null);

  // Load servers on mount
  useEffect(() => {
    if (!token) return;
    const loadServers = async () => {
      try {
        const loadedServers = await api.getServers(token);
        setServers(loadedServers);
      } catch (error) {
        console.error('Failed to load servers:', error);
      }
    };
    loadServers();
  }, [token, setServers]);

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !serverName.trim()) return;
    
    setLoading(true);
    try {
      const newServer = await api.createServer(serverName, serverDesc || undefined, token);
      setServers([...servers, newServer]);
      setCurrentServer(newServer);
      setServerName('');
      setServerDesc('');
      setShowCreateModal(false);
      onServerSelect?.();
    } catch (error) {
      console.error('Failed to create server:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveServer = async (serverId: string) => {
    if (!token) return;
    try {
      await api.leaveServer(serverId, token);
      setServers(servers.filter(s => s.id !== serverId));
      if (currentServer?.id === serverId) {
        setCurrentServer(null);
      }
    } catch (error) {
      console.error('Failed to leave server:', error);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    if (!token) return;
    try {
      await api.deleteServer(serverId, token);
      setServers(servers.filter(s => s.id !== serverId));
      if (currentServer?.id === serverId) {
        setCurrentServer(null);
      }
    } catch (error) {
      console.error('Failed to delete server:', error);
    }
  };

  return (
    <div className="server-list">
      <div className="server-list-header">
        <h3>{t('servers.title')}</h3>
      </div>

      <div className="server-list-content">
        {servers.length === 0 ? (
          <div className="server-list-empty">
            <p>{t('servers.noServers')}</p>
          </div>
        ) : (
          servers.map(server => (
            <div
              key={server.id}
              className={`server-item${currentServer?.id === server.id ? ' active' : ''}`}
              onClick={() => {
                setCurrentServer(server);
                onServerSelect?.();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setShowMenu(showMenu === server.id ? null : server.id);
              }}
            >
              <div className="server-item-icon">
                {server.icon ? (
                  <img src={server.icon} alt={server.name} />
                ) : (
                  <span>{server.name[0].toUpperCase()}</span>
                )}
              </div>
              <div className="server-item-info">
                <div className="server-item-name">{server.name}</div>
                {server.description && (
                  <div className="server-item-desc">{server.description}</div>
                )}
              </div>

              {showMenu === server.id && (
                <div className="server-item-menu">
                  {server.ownerId === user?.id && (
                    <>
                      <button className="menu-item menu-settings">
                        <Settings size={16} /> {t('servers.settings')}
                      </button>
                      <button
                        className="menu-item menu-danger"
                        onClick={() => {
                          handleDeleteServer(server.id);
                          setShowMenu(null);
                        }}
                      >
                        <Trash2 size={16} /> {t('servers.delete')}
                      </button>
                    </>
                  )}
                  {server.ownerId !== user?.id && (
                    <button
                      className="menu-item menu-danger"
                      onClick={() => {
                        handleLeaveServer(server.id);
                        setShowMenu(null);
                      }}
                    >
                      <LogOut size={16} /> {t('servers.leave')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <button
        className="server-list-create"
        onClick={() => setShowCreateModal(true)}
        title={t('servers.createNew')}
      >
        <Plus size={20} />
      </button>

      {showCreateModal && (
        <div className="server-create-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="server-create-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('servers.createNew')}</h2>
            <form onSubmit={handleCreateServer}>
              <input
                type="text"
                placeholder={t('servers.namePlaceholder')}
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                autoFocus
              />
              <textarea
                placeholder={t('servers.descPlaceholder')}
                value={serverDesc}
                onChange={(e) => setServerDesc(e.target.value)}
                rows={3}
              />
              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  {t('user.cancel')}
                </button>
                <button type="submit" disabled={loading || !serverName.trim()}>
                  {loading ? t('chat.loading') : t('servers.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
