import { useState, useEffect } from 'react';
import { X, MessageCircle, Flag, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Friend } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';
import { UserBadges } from '../UserBadges/UserBadges';
import { ReportModal } from '../ReportModal/ReportModal';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { useUI } from '../../context/UIContext';
import './UserProfileModal.css';

interface UserProfileModalProps {
  friend: Friend;
  onClose: () => void;
  onSendMessage?: () => void;
}

export function UserProfileModal({ friend, onClose, onSendMessage }: UserProfileModalProps) {
  const { user, token } = useStore();
  const { toast } = useUI();
  const { t } = useTranslation();
  const [showReport, setShowReport] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [isLikedByMe, setIsLikedByMe] = useState(false);
  const [liking, setLiking] = useState(false);

  // Fetch likes data on component mount
  useEffect(() => {
    const fetchLikesData = async () => {
      try {
        const likesData = await api.getUserLikesCount(friend.id);
        setLikesCount(likesData.count || 0);

        if (user && token) {
          const likedData = await api.checkIfUserLiked(friend.id, token);
          setIsLikedByMe(likedData.liked || false);
        }
      } catch (error) {
        console.error('Failed to fetch likes data:', error);
      }
    };

    fetchLikesData();
  }, [friend.id, user, token]);

  const handleLikeUser = async () => {
    if (!user || !token) return;
    setLiking(true);
    try {
      if (isLikedByMe) {
        await api.unlikeUser(friend.id, token);
        setIsLikedByMe(false);
        setLikesCount(Math.max(0, likesCount - 1));
        toast('Usunięto z ulubionych', 'info');
      } else {
        await api.likeUser(friend.id, token);
        setIsLikedByMe(true);
        setLikesCount(likesCount + 1);
        toast(t('user.likeUser'), 'success');
      }
    } catch (error: any) {
      const errorMsg = error?.message || 'Failed to update like';
      toast(`Error: ${errorMsg}`, 'error');
      console.error('Like error:', error);
    } finally {
      setLiking(false);
    }
  };

  const handleReportSubmit = async (category: string, reason: string) => {
    if (!user || !token) return;
    try {
      await api.reportMessage({
        messageId: 'user_report',
        messageContent: 'User profile report',
        reportedUserId: friend.id,
        reportedUsername: friend.username,
        senderId: user.id,
        receiverId: friend.id,
        category,
        reason,
      }, token);
      toast(t('report.success'), 'success');
      setShowReport(false);
      onClose();
    } catch {
      toast(t('report.error'), 'error');
    }
  };
  const getStatusColor = () => {
    switch (friend.status) {
      case 'online': return '#10b981';
      case 'away': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (friend.status) {
      case 'online': return 'Online';
      case 'away': return 'Zaraz wracam';
      default: return 'Offline';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="user-profile-modal" onClick={(e) => e.stopPropagation()}>
        <button className="profile-close-button" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="profile-banner">
          {friend.banner ? (
            <img className="profile-banner-img" src={getImageUrl(friend.banner)} alt="" />
          ) : (
            <div className="profile-banner-gradient" style={
              friend.profileColorTop && friend.profileColorBottom
                ? { background: `linear-gradient(to bottom, ${friend.profileColorTop}, ${friend.profileColorBottom})` }
                : undefined
            } />
          )}
        </div>

        <div className="profile-content">
          <div className="profile-avatar-container">
            <div className="profile-avatar">
              {friend.avatar ? (
                <img src={getImageUrl(friend.avatar)} alt={friend.username} />
              ) : (
                <div className="avatar-initial-large">{friend.username[0].toUpperCase()}</div>
              )}
            </div>
          </div>

          <div className="profile-info-section">
            <div className="profile-username-section">
              <div className="profile-username-row">
                <h2 className="profile-username" style={
                  friend.profileColorTop && friend.profileColorBottom
                    ? {
                        background: `linear-gradient(90deg, ${friend.profileColorTop}, ${friend.profileColorBottom})`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                      }
                    : undefined
                }>{friend.username}</h2>
                {friend.badges && friend.badges.length > 0 && (
                  <UserBadges badges={friend.badges} size="md" />
                )}
              </div>
              <div className="profile-status">
                <span className="status-dot" style={{ backgroundColor: getStatusColor() }} />
                {getStatusText()}
              </div>
            </div>

            {friend.bio && (
              <div className="profile-bio-section">
                <h3>O mnie</h3>
                <p>{friend.bio}</p>
              </div>
            )}

            <div className="profile-likes-section">
              <Heart size={16} fill={isLikedByMe ? '#ef4444' : 'none'} color={isLikedByMe ? '#ef4444' : 'currentColor'} />
              <span className="likes-count">{likesCount} {t('user.likes')}</span>
            </div>

            <div className="profile-actions">
              {onSendMessage && (
                <button className="action-button primary" onClick={onSendMessage}>
                  <MessageCircle size={18} />
                  Wyślij wiadomość
                </button>
              )}
              {user && user.id !== friend.id && (
                <button 
                  className={`action-button like-button ${isLikedByMe ? 'liked' : ''}`}
                  onClick={handleLikeUser}
                  disabled={liking}
                  title={isLikedByMe ? 'Unlike' : 'Like'}
                >
                  <Heart size={18} fill={isLikedByMe ? 'currentColor' : 'none'} />
                  {t('user.likeUser')}
                </button>
              )}
              {user && user.id !== friend.id && (
                <button className="action-button danger" onClick={() => setShowReport(true)}>
                  <Flag size={18} />
                  {t('user.reportUser')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {showReport && (
        <ReportModal
          senderUsername={friend.username}
          onClose={() => setShowReport(false)}
          onSubmit={handleReportSubmit}
        />
      )}
    </div>
  );
}
