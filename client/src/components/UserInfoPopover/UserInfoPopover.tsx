import { X } from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';
import './UserInfoPopover.css';

interface UserInfoPopoverProps {
  userId: string;
  username: string;
  avatar?: string;
  bio?: string;
  status: 'online' | 'offline' | 'away';
  onClose: () => void;
  position: { x: number; y: number };
}

export function UserInfoPopover({ userId, username, avatar, bio, status, onClose, position }: UserInfoPopoverProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'online': return '#10b981';
      case 'away': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'online': return 'Online';
      case 'away': return 'Zaraz wracam';
      default: return 'Offline';
    }
  };

  return (
    <>
      <div className="user-info-popover-overlay" onClick={onClose} />
      <div 
        className="user-info-popover" 
        style={{ 
          left: `${position.x}px`, 
          top: `${position.y}px` 
        }}
      >
        <button className="popover-close-btn" onClick={onClose}>
          <X size={16} />
        </button>

        <div className="popover-avatar-section">
          <div className="popover-avatar">
            {avatar ? (
              <img src={getImageUrl(avatar)} alt={username} />
            ) : (
              <div className="popover-avatar-initial">{username[0].toUpperCase()}</div>
            )}
            <div 
              className="popover-status-indicator" 
              style={{ backgroundColor: getStatusColor() }}
            />
          </div>
        </div>

        <div className="popover-info">
          <h3 className="popover-username">{username}</h3>
          <div className="popover-user-id">
            <span className="user-id-label">ID:</span>
            <span className="user-id-value">{userId}</span>
          </div>
          <div className="popover-status">
            <span className="status-dot" style={{ backgroundColor: getStatusColor() }} />
            {getStatusText()}
          </div>
          {bio && (
            <div className="popover-bio">
              <span className="bio-label">O użytkowniku:</span>
              <p>{bio}</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
