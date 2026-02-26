import { useState } from 'react';
import { X, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getImageUrl } from '../../utils/imageUrl';
import { UserBadges } from '../UserBadges/UserBadges';
import { ReportModal } from '../ReportModal/ReportModal';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { useUI } from '../../context/UIContext';
import './UserInfoPopover.css';

interface UserInfoPopoverProps {
  userId: string;
  username: string;
  avatar?: string;
  bio?: string;
  banner?: string;
  status: 'online' | 'offline' | 'away';
  badges?: string[];
  profileColorTop?: string;
  profileColorBottom?: string;
  onClose: () => void;
  position: { x: number; y: number };
}

export function UserInfoPopover({ userId, username, avatar, bio, banner, status, badges, profileColorTop, profileColorBottom, onClose, position }: UserInfoPopoverProps) {
  const { t } = useTranslation();
  const { user, token } = useStore();
  const { toast } = useUI();
  const [idExpanded, setIdExpanded] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [showReport, setShowReport] = useState(false);

  const handleReportSubmit = async (category: string, reason: string) => {
    if (!user || !token) return;
    try {
      await api.reportMessage({
        messageId: 'user_report',
        messageContent: 'User report from popover',
        reportedUserId: userId,
        reportedUsername: username,
        senderId: user.id,
        receiverId: userId,
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
    switch (status) {
      case 'online': return '#10b981';
      case 'away': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'online': return t('status.online');
      case 'away':   return t('status.away');
      default:       return t('status.offline');
    }
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(userId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <>
      <div className="user-info-popover-overlay" onClick={onClose} />
      <div
        className="user-info-popover"
        style={{
          left: `${position.x}px`,
          top:  `${position.y}px`,
        }}
      >
        <button className="popover-close-btn" onClick={onClose}>
          <X size={16} />
        </button>

        {banner && (
          <div className="popover-banner">
            <img src={getImageUrl(banner)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        {!banner && profileColorTop && profileColorBottom && (
          <div className="popover-banner" style={{ background: `linear-gradient(to bottom, ${profileColorTop}, ${profileColorBottom})`, height: 60 }} />
        )}

        <div className="popover-avatar-section">
          <div className="popover-avatar">
            {avatar ? (
              <img src={getImageUrl(avatar)} alt={username} />
            ) : (
              <div className="popover-avatar-initial">{username[0].toUpperCase()}</div>
            )}
          </div>
        </div>

        <div className="popover-info">
          <div className="popover-username-row">
            <h3 className="popover-username" style={
              profileColorTop && profileColorBottom
                ? {
                    background: `linear-gradient(90deg, ${profileColorTop}, ${profileColorBottom})`,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }
                : undefined
            }>{username}</h3>
            {badges && badges.length > 0 && <UserBadges badges={badges} size="sm" />}
          </div>

          <div className="popover-status">
            <span className="status-dot" style={{ backgroundColor: getStatusColor() }} />
            {getStatusText()}
          </div>

          {bio && (
            <div className="popover-bio">
              <span className="bio-label">{t('profile.bio')}</span>
              <p>{bio}</p>
            </div>
          )}

          {/* 3-dot toggle for user ID */}
          <div className="popover-id-section">
            <button
              className="popover-dots-btn"
              onClick={() => setIdExpanded(v => !v)}
              title="Show user ID"
            >
              <span className={`popover-dots-icon${idExpanded ? ' open' : ''}`}>•••</span>
            </button>

            {idExpanded && (
              <div className="popover-id-row">
                <span className="popover-id-value">{userId}</span>
                <button className="popover-copy-btn" onClick={handleCopyId}>
                  {copied ? t('update.copied') : t('update.copyId')}
                </button>
              </div>
            )}
          </div>

          {/* Report button — only visible if not viewing own profile */}
          {user && user.id !== userId && (
            <div className="popover-report-section">
              <button className="popover-report-btn" onClick={() => setShowReport(true)}>
                <Flag size={13} />
                {t('user.reportUser')}
              </button>
            </div>
          )}
        </div>
      </div>
      {showReport && (
        <ReportModal
          senderUsername={username}
          onClose={() => setShowReport(false)}
          onSubmit={handleReportSubmit}
        />
      )}
    </>
  );
}
