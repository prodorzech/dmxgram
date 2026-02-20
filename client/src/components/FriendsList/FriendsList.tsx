import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Check, X, Loader } from 'lucide-react';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { getImageUrl } from '../../utils/imageUrl';
import { useTranslation } from 'react-i18next';
import './FriendsList.css';

export const FriendsList: React.FC = () => {
  const { t } = useTranslation();
  const { friends, friendRequests, currentFriend, setCurrentFriend, setFriends, setFriendRequests, removeFriendRequest, addFriend, addFriendRequest, token } = useStore();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'add'>('friends');
  const [addUsername, setAddUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadFriends();
    loadFriendRequests();
    
    // Listen for status updates from other users
    const handleStatusUpdate = ({ userId, status }: { userId: string; status: 'online' | 'offline' | 'away' }) => {
      setFriends(friends.map(friend => 
        friend.id === userId ? { ...friend, status } : friend
      ));
      
      // Update current friend if their status changed
      if (currentFriend?.id === userId) {
        setCurrentFriend({ ...currentFriend, status });
      }
    };

    socketService.on('user:status', handleStatusUpdate);

    return () => {
      socketService.off('user:status', handleStatusUpdate);
    };
  }, [friends, currentFriend]);

  // Listen for real-time friend request events
  useEffect(() => {
    const handleIncomingRequest = (request: any) => {
      addFriendRequest(request);
      setActiveTab('requests');
    };

    const handleRequestAccepted = ({ requestId, friend }: { requestId: string; friend: any }) => {
      if (friend) {
        addFriend(friend);
      }
      removeFriendRequest(requestId);
    };

    socketService.on('friend:request', handleIncomingRequest);
    socketService.on('friend:accepted', handleRequestAccepted);

    return () => {
      socketService.off('friend:request', handleIncomingRequest);
      socketService.off('friend:accepted', handleRequestAccepted);
    };
  }, []);

  const loadFriends = async () => {
    if (!token) return;
    try {
      const data = await api.getFriends(token);
      setFriends(data);
    } catch (err: any) {
      console.error('Failed to load friends:', err);
    }
  };

  const loadFriendRequests = async () => {
    if (!token) return;
    try {
      const data = await api.getFriendRequests(token);
      setFriendRequests(data);
    } catch (err: any) {
      console.error('Failed to load friend requests:', err);
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsername.trim() || !token) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await api.sendFriendRequest(addUsername.trim(), token);
      setSuccess('Zaproszenie wysłane!');
      setAddUsername('');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await api.acceptFriendRequest(requestId, token);
      removeFriendRequest(requestId);
      loadFriends(); // Reload friends list
      setSuccess('Zaproszenie zaakceptowane!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await api.rejectFriendRequest(requestId, token);
      removeFriendRequest(requestId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10b981';
      case 'away': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  return (
    <div className="friends-list">
      <div className="friends-header">
        <Users size={24} />
        <h2>{t('friends.title')}</h2>
      </div>

      <div className="friends-tabs">
        <button
          className={`tab ${activeTab === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveTab('friends')}
        >
          {t('friends.friends')} {friends.length > 0 && `(${friends.length})`}
        </button>
        <button
          className={`tab ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          {t('friends.requests')} {friendRequests.length > 0 && `(${friendRequests.length})`}
        </button>
        <button
          className={`tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          <UserPlus size={16} />
          {t('friends.add')}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      <div className="friends-content">
        {activeTab === 'friends' && (
          <div className="friends-container">
            {friends.length === 0 ? (
              <div className="empty-state">
                <Users size={48} />
                <p>{t('friends.noFriends')}</p>
                <span>{t('friends.addFirstFriend')}</span>
              </div>
            ) : (
              friends.map(friend => (
                <div
                  key={friend.id}
                  className={`friend-item ${currentFriend?.id === friend.id ? 'active' : ''}`}
                  onClick={() => setCurrentFriend(friend)}
                >
                  <div className="friend-avatar">
                    {friend.avatar ? (
                      <img src={getImageUrl(friend.avatar)} alt={friend.username} />
                    ) : (
                      <div className="avatar-initial">{friend.username[0].toUpperCase()}</div>
                    )}
                    <div
                      className="status-indicator"
                      style={{ backgroundColor: getStatusColor(friend.status) }}
                    />
                  </div>
                  <div className="friend-info">
                    <div className="friend-username">{friend.username}</div>
                    {friend.bio && <div className="friend-bio">{friend.bio}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="requests-container">
            {friendRequests.length === 0 ? (
              <div className="empty-state">
                <Users size={48} />
                <p>{t('friends.noRequests')}</p>
              </div>
            ) : (
              friendRequests.map(request => (
                <div key={request.id} className="request-item">
                  <div className="request-info">
                    <div className="request-username">{request.senderUsername}</div>
                    <div className="request-date">
                      {new Date(request.createdAt).toLocaleDateString('pl-PL')}
                    </div>
                  </div>
                  <div className="request-actions">
                    <button
                      className="accept-btn"
                      onClick={() => handleAcceptRequest(request.id)}
                      title={t('friends.accept')}
                    >
                      <Check size={18} />
                    </button>
                    <button
                      className="reject-btn"
                      onClick={() => handleRejectRequest(request.id)}
                      title={t('friends.reject')}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'add' && (
          <div className="add-friend-container">
            <form onSubmit={handleSendRequest} className="add-friend-form">
              <label>{t('friends.addFriendByUsername')}</label>
              <input
                type="text"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                placeholder={t('friends.enterUsername') + '...'}
                disabled={loading}
              />
              <button type="submit" disabled={loading || !addUsername.trim()}>
                {loading ? <Loader size={18} className="spin" /> : <UserPlus size={18} />}
                {t('friends.sendInvitation')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
