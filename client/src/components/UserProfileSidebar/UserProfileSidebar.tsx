import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { Friend } from '../../types';
import { api } from '../../services/api';
import { useStore } from '../../store';
import { getImageUrl } from '../../utils/imageUrl';
import { UserBadges } from '../UserBadges/UserBadges';
import './UserProfileSidebar.css';

interface UserProfileSidebarProps {
  friend: Friend;
}

interface MutualFriend {
  id: string;
  username: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
}

export const UserProfileSidebar: React.FC<UserProfileSidebarProps> = ({ friend }) => {
  const { t } = useTranslation();
  const { token } = useStore();
  const [mutualFriends, setMutualFriends] = useState<MutualFriend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMutualFriends();
  }, [friend.id]);

  const loadMutualFriends = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const mutual = await api.getMutualFriends(friend.id, token);
      setMutualFriends(mutual);
    } catch (error) {
      console.error('Failed to load mutual friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status: 'online' | 'offline' | 'away') => {
    switch (status) {
      case 'online':
        return t('status.online');
      case 'away':
        return t('status.away');
      case 'offline':
        return t('status.offline');
      default:
        return t('status.offline');
    }
  };

  return (
    <div className="user-profile-sidebar">
      {/* User Header */}
      <div className="profile-sidebar-header">
        {friend.banner ? (
          <img className="profile-sidebar-banner-img" src={getImageUrl(friend.banner)} alt="" style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div className="profile-sidebar-banner" style={
            friend.profileColorTop && friend.profileColorBottom
              ? { background: `linear-gradient(to bottom, ${friend.profileColorTop}, ${friend.profileColorBottom})` }
              : undefined
          } />
        )}
        <div className="profile-sidebar-avatar-container">
          {friend.avatar ? (
            <img src={getImageUrl(friend.avatar)} alt={friend.username} className="profile-sidebar-avatar" />
          ) : (
            <div className="profile-sidebar-avatar profile-sidebar-avatar-initial">
              {friend.username[0].toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* User Info */}
      <div className="profile-sidebar-content">
        <div className="profile-sidebar-username-row">
          <span className="profile-sidebar-username" style={
            friend.profileColorTop && friend.profileColorBottom
              ? {
                  background: `linear-gradient(90deg, ${friend.profileColorTop}, ${friend.profileColorBottom})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }
              : undefined
          }>{friend.username}</span>
          {friend.badges && friend.badges.length > 0 && (
            <UserBadges badges={friend.badges} size="md" />
          )}
        </div>
        <div className="profile-sidebar-status-text">{getStatusText(friend.status)}</div>

        <div className="profile-sidebar-divider" />

        {/* About Me */}
        <div className="profile-sidebar-section">
          <h3 className="profile-sidebar-section-title">{t('profile.aboutMe')}</h3>
          {friend.bio ? (
            <p className="profile-sidebar-bio">{friend.bio}</p>
          ) : (
            <p className="profile-sidebar-no-bio">{t('profile.noBio')}</p>
          )}
        </div>

        <div className="profile-sidebar-divider" />

        {/* Mutual Friends */}
        <div className="profile-sidebar-section">
          <h3 className="profile-sidebar-section-title">
            <Users size={16} />
            {t('profile.mutualFriends')} — {mutualFriends.length}
          </h3>
          {loading ? (
            <p className="profile-sidebar-loading">{t('profile.loading')}</p>
          ) : mutualFriends.length > 0 ? (
            <div className="mutual-friends-grid">
              {mutualFriends.map((mutual) => (
                <div key={mutual.id} className="mutual-friend-item">
                  <div className="mutual-friend-avatar-container">
                    {mutual.avatar ? (
                      <img 
                        src={getImageUrl(mutual.avatar)} 
                        alt={mutual.username} 
                        className="mutual-friend-avatar" 
                      />
                    ) : (
                      <div className="mutual-friend-avatar mutual-friend-avatar-initial">
                        {mutual.username[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="mutual-friend-username">{mutual.username}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-sidebar-no-mutual">{t('profile.noMutualFriends')}</p>
          )}
        </div>
      </div>
    </div>
  );
};
