import { useState } from 'react';
import { X, User as UserIcon, Shield } from 'lucide-react';
import { useStore } from '../../store';
import { UserStatus } from '../UserStatus/UserStatus';
import './SettingsModal.css';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { user } = useStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'status'>('status');

  if (!user) return null;

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-modal-header">
          <h2>Ustawienia</h2>
          <button onClick={onClose} className="close-btn">
            <X size={20} />
          </button>
        </div>

        <div className="settings-modal-content">
          <div className="settings-tabs">
            <button
              className={`settings-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <UserIcon size={18} />
              Profil
            </button>
            <button
              className={`settings-tab ${activeTab === 'status' ? 'active' : ''}`}
              onClick={() => setActiveTab('status')}
            >
              <Shield size={18} />
              Status Konta
            </button>
          </div>

          <div className="settings-content">
            {activeTab === 'profile' && (
              <div className="profile-section">
                <h3>Informacje o profilu</h3>
                <p>Tutaj będą ustawienia profilu...</p>
              </div>
            )}

            {activeTab === 'status' && (
              <UserStatus user={user} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
