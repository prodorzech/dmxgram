import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Check, X, Loader, UserMinus, ShieldBan, ShieldOff } from 'lucide-react';
import { useStore } from '../../store';
import { useUI } from '../../context/UIContext';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { getImageUrl } from '../../utils/imageUrl';
import { useTranslation } from 'react-i18next';
import './FriendsList.css';

export const FriendsList: React.FC = () => {
  const { t } = useTranslation();
  const { friends, friendRequests, currentFriend, setCurrentFriend, setFriends, setFriendRequests,
    removeFriendRequest, addFriend, addFriendRequest, removeFriend, token, user, updateUserStatus,
    setBlockedUserIds, addBlockedUserId, removeBlockedUserId } = useStore();
  const { confirm, toast } = useUI();
  const [activeTab, setActiveTab] = useState<'friends' | 'requests' | 'add' | 'blocked'>('friends');
  const [addUsername, setAddUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<{id: string; username: string; avatar?: string}[]>([]);

  const toastErr = (err: any) => {
    const key = `friends.${err?.message ?? ''}`;
    toast(t(key, { defaultValue: t('errors.generic') }), 'error');
  };

  useEffect(() => {
    loadFriends();
    loadFriendRequests();
    loadBlockedUsers();
    
    // Listen for status updates from other users
    const handleStatusUpdate = ({ userId, status }: { userId: string; status: 'online' | 'offline' | 'away' }) => {
      setFriends(friends.map(friend => 
        friend.id === userId ? { ...friend, status } : friend
      ));
      
      // Update current friend if their status changed
      if (currentFriend?.id === userId) {
        setCurrentFriend({ ...currentFriend, status });
      }

      // Update own status in store if the event is for the current user
      if (userId === user?.id) {
        updateUserStatus(status);
      }
    };

    // Update friend avatar/bio when they change their profile
    const handleProfileUpdated = (data: { userId: string; username: string; avatar?: string; bio?: string }) => {
      setFriends(friends.map(f =>
        f.id === data.userId ? { ...f, username: data.username, avatar: data.avatar, bio: data.bio } : f
      ));
      if (currentFriend?.id === data.userId) {
        setCurrentFriend({ ...currentFriend, username: data.username, avatar: data.avatar, bio: data.bio });
      }
    };

    socketService.on('user:status', handleStatusUpdate);
    socketService.on('user:profile:updated', handleProfileUpdated);

    return () => {
      socketService.off('user:status', handleStatusUpdate);
      socketService.off('user:profile:updated', handleProfileUpdated);
    };
  }, [friends, currentFriend]);

  // Listen for real-time friend request events + block-triggered removals
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

    // Emitted when someone blocks us — remove them from our friends list
    const handleFriendRemoved = ({ friendId }: { friendId: string }) => {
      removeFriend(friendId);
    };

    socketService.on('friend:request', handleIncomingRequest);
    socketService.on('friend:accepted', handleRequestAccepted);
    socketService.on('friend:removed', handleFriendRemoved);

    return () => {
      socketService.off('friend:request', handleIncomingRequest);
      socketService.off('friend:accepted', handleRequestAccepted);
      socketService.off('friend:removed', handleFriendRemoved);
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

  const loadBlockedUsers = async () => {
    if (!token) return;
    try {
      const data = await api.getBlockedUsers(token);
      setBlockedUsers(data);
      setBlockedUserIds(data.map(u => u.id));
    } catch (err: any) {
      console.error('Failed to load blocked users:', err);
    }
  };

  const handleBlockFriend = async (e: React.MouseEvent, friendId: string, username: string) => {
    e.stopPropagation();
    const ok = await confirm(t('friends.confirmBlock', { username }));
    if (!ok || !token) return;
    try {
      await api.blockUser(friendId, token);
      addBlockedUserId(friendId);
      removeFriend(friendId);
      setBlockedUsers(prev => [...prev.filter(u => u.id !== friendId),
        { id: friendId, username, avatar: friends.find(f => f.id === friendId)?.avatar }]);
      toast(t('friends.blockedToast', { username }), 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to block user', 'error');
    }
  };

  const handleUnblockUser = async (userId: string, username: string) => {
    const ok = await confirm(t('friends.confirmUnblock', { username }));
    if (!ok || !token) return;
    try {
      await api.unblockUser(userId, token);
      removeBlockedUserId(userId);
      setBlockedUsers(prev => prev.filter(u => u.id !== userId));
      toast(t('friends.unblockedToast', { username }), 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to unblock user', 'error');
    }
  };

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addUsername.trim() || !token) return;

    setLoading(true);

    try {
      await api.sendFriendRequest(addUsername.trim(), token);
      toast(t('friends.requestSent'), 'success');
      setAddUsername('');
    } catch (err: any) {
      toastErr(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await api.acceptFriendRequest(requestId, token);
      removeFriendRequest(requestId);
      loadFriends();
      toast(t('friends.requestAccepted'), 'success');
    } catch (err: any) {
      toastErr(err);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!token) return;
    try {
      await api.rejectFriendRequest(requestId, token);
      removeFriendRequest(requestId);
    } catch (err: any) {
      toastErr(err);
    }
  };

  const handleRemoveFriend = async (e: React.MouseEvent, friendId: string, username: string) => {
    e.stopPropagation();
    const ok = await confirm(t('friends.confirmRemove', { username }));
    if (!ok || !token) return;
    try {
      await api.removeFriend(friendId, token);
      removeFriend(friendId);
      toast(`${username} removed from friends`, 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to remove friend', 'error');
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
        <button
          className={`tab ${activeTab === 'blocked' ? 'active' : ''}`}
          onClick={() => setActiveTab('blocked')}
          title={t('friends.blocked')}
        >
          <ShieldBan size={16} />
        </button>
      </div>

      {/* Inline error/success removed — errors shown via auto-dismissing toast */}

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
                  </div>
                  <div className="friend-info">
                    <div className="friend-username">{friend.username}</div>
                    <div className={`friend-status-text ${friend.status}`}>
                      {friend.status === 'online' ? t('friends.online') : friend.status === 'away' ? t('friends.away') : t('friends.offline')}
                    </div>
                  </div>
                  <button
                    className="block-friend-btn"
                    onClick={(e) => handleBlockFriend(e, friend.id, friend.username)}
                    title={t('friends.block')}
                  >
                    <ShieldBan size={15} />
                  </button>
                  <button
                    className="remove-friend-btn"
                    onClick={(e) => handleRemoveFriend(e, friend.id, friend.username)}
                    title={t('friends.remove')}
                  >
                    <UserMinus size={15} />
                  </button>
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
        {activeTab === 'blocked' && (
          <div className="blocked-container">
            {blockedUsers.length === 0 ? (
              <div className="empty-state">
                <ShieldBan size={48} />
                <p>{t('friends.noBlocked')}</p>
              </div>
            ) : (
              blockedUsers.map(user => (
                <div key={user.id} className="blocked-item">
                  <div className="friend-avatar">
                    {user.avatar ? (
                      <img src={getImageUrl(user.avatar)} alt={user.username} />
                    ) : (
                      <div className="avatar-initial">{user.username[0].toUpperCase()}</div>
                    )}
                  </div>
                  <div className="friend-info">
                    <div className="friend-username">{user.username}</div>
                    <div className="friend-status-text">{t('friends.blocked')}</div>
                  </div>
                  <button
                    className="unblock-btn"
                    onClick={() => handleUnblockUser(user.id, user.username)}
                    title={t('friends.unblock')}
                  >
                    <ShieldOff size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
