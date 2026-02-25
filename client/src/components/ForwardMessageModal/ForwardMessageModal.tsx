import React, { useState, useMemo } from 'react';
import { Share2, X, Search, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Friend } from '../../types';
import { getImageUrl } from '../../utils/imageUrl';
import './ForwardMessageModal.css';

interface ForwardMessageModalProps {
  friends: Friend[];
  onClose: () => void;
  onForward: (friendIds: string[]) => void;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({ friends, onClose, onForward }) => {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.toLowerCase();
    return friends.filter(f => f.username.toLowerCase().includes(q));
  }, [friends, search]);

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleForward = () => {
    if (selectedIds.size === 0) return;
    onForward(Array.from(selectedIds));
  };

  return (
    <div className="forward-modal-overlay" onMouseDown={onClose}>
      <div className="forward-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="forward-modal-header">
          <Share2 size={18} />
          <h3>{t('chat.forwardTo')}</h3>
          <button className="forward-modal-close" onClick={onClose} title={t('user.cancel')}>
            <X size={18} />
          </button>
        </div>

        <div className="forward-search-wrapper">
          <Search size={15} className="forward-search-icon" />
          <input
            className="forward-search-input"
            type="text"
            placeholder={t('chat.forwardSearchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="forward-friends-list">
          {filtered.length === 0 ? (
            <div className="forward-no-friends">{t('chat.forwardNoFriends')}</div>
          ) : (
            filtered.map(friend => {
              const selected = selectedIds.has(friend.id);
              return (
                <div
                  key={friend.id}
                  className={`forward-friend-item${selected ? ' selected' : ''}`}
                  onClick={() => toggle(friend.id)}
                >
                  <div className="forward-friend-avatar">
                    {friend.avatar ? (
                      <img src={getImageUrl(friend.avatar)} alt={friend.username} />
                    ) : (
                      <div className="forward-avatar-initial">{friend.username[0].toUpperCase()}</div>
                    )}
                    <span className={`forward-status-dot ${friend.status}`} />
                  </div>
                  <span className="forward-friend-name">{friend.username}</span>
                  <div className={`forward-checkbox${selected ? ' checked' : ''}`}>
                    {selected && <Check size={14} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          className="forward-send-btn"
          disabled={selectedIds.size === 0}
          onClick={handleForward}
        >
          <Share2 size={15} />
          {t('chat.forwardSend')} {selectedIds.size > 0 && `(${selectedIds.size})`}
        </button>
      </div>
    </div>
  );
};
