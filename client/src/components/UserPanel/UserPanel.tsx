import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { useUI } from '../../context/UIContext';
import { Settings, LogOut, ChevronDown, Shield } from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import './UserPanel.css';

interface UserPanelProps {
  onSettingsClick: () => void;
  onAdminClick?: () => void;
}

export function UserPanel({ onSettingsClick, onAdminClick }: UserPanelProps) {
  const { t } = useTranslation();
  const { user, token, logout, updateUserStatus } = useStore();
  const { confirm } = useUI();
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);

  if (!user) return null;

  // Close status menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target as Node)) {
        setShowStatusMenu(false);
      }
    };

    if (showStatusMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showStatusMenu]);

  const getStatusColor = () => {
    switch (user.status) {
      case 'online':
        return '#10b981';
      case 'away':
        return '#f59e0b';
      case 'offline':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  const getStatusText = () => {
    switch (user.status) {
      case 'online': return t('status.online');
      case 'away': return t('status.away');
      case 'offline': return t('status.offline');
      default: return t('status.offline');
    }
  };

  const handleStatusChange = async (newStatus: 'online' | 'offline' | 'away') => {
    if (!token || newStatus === user.status) return;
    
    try {
      await api.updateStatus(newStatus, token);
      updateUserStatus(newStatus);
      
      // Notify via socket
      socketService.emit('status:change', { status: newStatus });
      
      setShowStatusMenu(false);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleLogout = async () => {
    const ok = await confirm('Are you sure you want to log out?');
    if (!ok) return;
    logout();
    window.location.href = '/';
  };

  return (
    <div className="user-panel">
      <div className="user-panel-content">
        <div className="user-avatar-container">
          <div className="user-avatar">
            {user.avatar ? (
              <img src={getImageUrl(user.avatar)} alt={user.username} />
            ) : (
              <div className="avatar-initial">{user.username[0].toUpperCase()}</div>
            )}
          </div>
          <div className="user-status-indicator" style={{ backgroundColor: getStatusColor() }} />
        </div>
        
        <div className="user-info">
          <div className="user-name">{user.username}</div>
          <div 
            className="user-status-selector" 
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            title={t('user.changeStatus')}
          >
            <span className="user-status-text">{getStatusText()}</span>
            <ChevronDown size={14} className="status-chevron" />
          </div>

          
          {showStatusMenu && (
            <div className="status-menu" ref={statusMenuRef}>
              <div 
                className={`status-menu-item ${user.status === 'online' ? 'active' : ''}`}
                onClick={() => handleStatusChange('online')}
              >
                <div className="status-indicator" style={{ backgroundColor: '#10b981' }} />
                <span>{t('status.online')}</span>
              </div>
              <div 
                className={`status-menu-item ${user.status === 'away' ? 'active' : ''}`}
                onClick={() => handleStatusChange('away')}
              >
                <div className="status-indicator" style={{ backgroundColor: '#f59e0b' }} />
                <span>{t('status.away')}</span>
              </div>
              <div 
                className={`status-menu-item ${user.status === 'offline' ? 'active' : ''}`}
                onClick={() => handleStatusChange('offline')}
              >
                <div className="status-indicator" style={{ backgroundColor: '#6b7280' }} />
                <span>{t('status.offline')}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="user-panel-actions">
        {user.isAdmin && onAdminClick && (
          <button 
            className="user-action-button admin" 
            onClick={onAdminClick}
            title="Panel Administracyjny"
          >
            <Shield size={18} />
          </button>
        )}
        <button 
          className="user-action-button" 
          onClick={onSettingsClick} 
          title="Ustawienia użytkownika"
        >
          <Settings size={18} />
        </button>
        <button 
          className="user-action-button logout" 
          onClick={handleLogout}
          title="Wyloguj"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}
