import { useState } from 'react';
import { X, MessageCircle, Flag } from 'lucide-react';
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
          <div className="profile-banner-gradient" style={
            friend.profileColorTop && friend.profileColorBottom
              ? { background: `linear-gradient(to bottom, ${friend.profileColorTop}, ${friend.profileColorBottom})` }
              : undefined
          } />
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
                <h2 className="profile-username">{friend.username}</h2>
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

            <div className="profile-actions">
              {onSendMessage && (
                <button className="action-button primary" onClick={onSendMessage}>
                  <MessageCircle size={18} />
                  Wyślij wiadomość
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
