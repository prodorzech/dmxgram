import { X, MessageCircle } from 'lucide-react';
import { Friend } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';
import './UserProfileModal.css';

interface UserProfileModalProps {
  friend: Friend;
  onClose: () => void;
  onSendMessage?: () => void;
}

export function UserProfileModal({ friend, onClose, onSendMessage }: UserProfileModalProps) {
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
          <div className="profile-banner-gradient" />
        </div>

        <div className="profile-content">
          <div className="profile-avatar-container">
            <div className="profile-avatar">
              {friend.avatar ? (
                <img src={getImageUrl(friend.avatar)} alt={friend.username} />
              ) : (
                <div className="avatar-initial-large">{friend.username[0].toUpperCase()}</div>
              )}
              <div
                className="profile-status-indicator"
                style={{ backgroundColor: getStatusColor() }}
              />
            </div>
          </div>

          <div className="profile-info-section">
            <div className="profile-username-section">
              <h2 className="profile-username">{friend.username}</h2>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
