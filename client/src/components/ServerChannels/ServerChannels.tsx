import { useEffect, useState } from 'react';
import { Plus, Trash2, Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { api } from '../../services/api';
import './ServerChannels.css';

export function ServerChannels() {
  const { t } = useTranslation();
  const { currentServer, setCurrentChannel, currentChannel, token, user } = useStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelDesc, setChannelDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState(currentServer?.channels || []);

  useEffect(() => {
    if (currentServer) {
      setChannels(currentServer.channels);
    }
  }, [currentServer]);

  if (!currentServer) {
    return (
      <div className="server-channels-empty">
        <p>{t('servers.noServerSelected')}</p>
      </div>
    );
  }

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !currentServer || !channelName.trim()) return;

    setLoading(true);
    try {
      const newChannel = await api.createChannel(
        currentServer.id,
        channelName,
        channelDesc || undefined,
        token
      );
      setChannels([...channels, newChannel]);
      setChannelName('');
      setChannelDesc('');
      setShowCreateModal(false);
      setCurrentChannel(newChannel);
    } catch (error) {
      console.error('Failed to create channel:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!token || !currentServer) return;
    try {
      await api.deleteChannel(currentServer.id, channelId, token);
      setChannels(channels.filter(c => c.id !== channelId));
      if (currentChannel?.id === channelId) {
        setCurrentChannel(null);
      }
    } catch (error) {
      console.error('Failed to delete channel:', error);
    }
  };

  return (
    <div className="server-channels">
      <div className="server-channels-header">
        <div className="header-info">
          <h2>{currentServer.name}</h2>
          {currentServer.description && (
            <p className="server-desc">{currentServer.description}</p>
          )}
        </div>
      </div>

      <div className="channels-list-section">
        <div className="channels-list-header">
          <span>{t('servers.channels')}</span>
          {currentServer.ownerId === user?.id && (
            <button
              className="create-channel-btn"
              onClick={() => setShowCreateModal(true)}
              title={t('servers.createChannel')}
            >
              <Plus size={14} />
            </button>
          )}
        </div>

        <div className="channels-list">
          {channels.length === 0 ? (
            <div className="channels-empty">
              <p>{t('servers.noChannels')}</p>
            </div>
          ) : (
            channels.map(channel => (
              <div
                key={channel.id}
                className={`channel-item${currentChannel?.id === channel.id ? ' active' : ''}`}
                onClick={() => setCurrentChannel(channel)}
              >
                <Hash size={16} />
                <span>{channel.name}</span>
                {currentServer.ownerId === user?.id && (
                  <button
                    className="delete-channel-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteChannel(channel.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="create-channel-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="create-channel-modal" onClick={(e) => e.stopPropagation()}>
            <h3>{t('servers.createChannel')}</h3>
            <form onSubmit={handleCreateChannel}>
              <input
                type="text"
                placeholder={t('servers.channelName')}
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                autoFocus
              />
              <textarea
                placeholder={t('servers.descPlaceholder')}
                value={channelDesc}
                onChange={(e) => setChannelDesc(e.target.value)}
                rows={2}
              />
              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  {t('user.cancel')}
                </button>
                <button type="submit" disabled={loading || !channelName.trim()}>
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
