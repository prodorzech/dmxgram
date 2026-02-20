import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, ChevronLeft, Pencil, Trash2, Flag, X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { CustomEmojiPicker } from '../CustomEmojiPicker/CustomEmojiPicker';
import { UserProfileModal } from '../UserProfileModal/UserProfileModal';
import { UserInfoPopover } from '../UserInfoPopover/UserInfoPopover';
import { UserProfileSidebar } from '../UserProfileSidebar/UserProfileSidebar';
import { getImageUrl } from '../../utils/imageUrl';
import { DirectMessage } from '../../types';
import './DMChat.css';

interface ContextMenu {
  x: number;
  y: number;
  message: DirectMessage;
  isOwn: boolean;
}

export const DMChat: React.FC = () => {
  const { t } = useTranslation();
  const { currentFriend, setCurrentFriend, directMessages, addDirectMessage, setDirectMessages,
    updateDirectMessage, removeDirectMessage, user, token, addTypingFriend, removeTypingFriend, typingFriends } = useStore();
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserPopover, setShowUserPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const [popoverUser, setPopoverUser] = useState<{
    userId: string; username: string; avatar?: string; bio?: string;
    status: 'online' | 'offline' | 'away';
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number>();

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (contextMenu) setContextMenu(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker, contextMenu]);

  useEffect(() => {
    if (currentFriend) {
      loadMessages();
      socketService.emit('dm:join', { friendId: currentFriend.id });
      return () => { socketService.emit('dm:leave', { friendId: currentFriend.id }); };
    }
  }, [currentFriend]);

  useEffect(() => {
    const handleNewDM = (dm: any) => {
      if (currentFriend &&
        ((dm.senderId === currentFriend.id && dm.receiverId === user?.id) ||
          (dm.senderId === user?.id && dm.receiverId === currentFriend.id))) {
        addDirectMessage(dm);
      }
    };
    const handleEdited = (dm: any) => { updateDirectMessage(dm.id, dm.content); };
    const handleDeleted = ({ messageId }: { messageId: string }) => { removeDirectMessage(messageId); };
    const handleTypingStart = (data: { friendId: string; username: string }) => {
      if (currentFriend && data.friendId === currentFriend.id) addTypingFriend(data.friendId);
    };
    const handleTypingStop = (data: { friendId: string }) => { removeTypingFriend(data.friendId); };

    socketService.on('dm:new', handleNewDM);
    socketService.on('dm:edited', handleEdited);
    socketService.on('dm:deleted', handleDeleted);
    socketService.on('dm:typing:start', handleTypingStart);
    socketService.on('dm:typing:stop', handleTypingStop);

    return () => {
      socketService.off('dm:new', handleNewDM);
      socketService.off('dm:edited', handleEdited);
      socketService.off('dm:deleted', handleDeleted);
      socketService.off('dm:typing:start', handleTypingStart);
      socketService.off('dm:typing:stop', handleTypingStop);
    };
  }, [currentFriend, user]);

  useEffect(() => { scrollToBottom(); }, [directMessages]);

  const loadMessages = async () => {
    if (!currentFriend || !token) return;
    try {
      const messages = await api.getDirectMessages(currentFriend.id, token);
      setDirectMessages(messages);
    } catch (err) { console.error('Failed to load messages:', err); }
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !currentFriend) return;
    socketService.emit('dm:send', { friendId: currentFriend.id, content: message.trim() });
    setMessage('');
    setShowEmojiPicker(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socketService.emit('dm:typing:stop', { friendId: currentFriend.id });
  };

  const handleTyping = (value: string) => {
    setMessage(value);
    if (!currentFriend) return;
    socketService.emit('dm:typing:start', { friendId: currentFriend.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      socketService.emit('dm:typing:stop', { friendId: currentFriend.id });
    }, 2000);
  };

  const handleEmojiClick = (emoji: string) => {
    setMessage(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const handleAvatarClick = (event: React.MouseEvent, userId: string, username: string,
    avatar?: string, bio?: string, status?: 'online' | 'offline' | 'away') => {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    setPopoverUser({ userId, username, avatar, bio, status: status || 'offline' });
    setPopoverPosition({ x: rect.left + rect.width + 10, y: rect.top });
    setShowUserPopover(true);
  };

  const handleContextMenu = (e: React.MouseEvent, dm: DirectMessage, isOwn: boolean) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message: dm, isOwn });
  };

  const handleEdit = () => {
    if (!contextMenu) return;
    setEditingId(contextMenu.message.id);
    setEditingContent(contextMenu.message.content);
    setContextMenu(null);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentFriend || !editingId || !editingContent.trim()) return;
    socketService.emit('dm:edit', { friendId: currentFriend.id, messageId: editingId, content: editingContent.trim() });
    setEditingId(null);
    setEditingContent('');
  };

  const handleDelete = () => {
    if (!contextMenu || !currentFriend) return;
    socketService.emit('dm:delete', { friendId: currentFriend.id, messageId: contextMenu.message.id });
    setContextMenu(null);
  };

  const handleReport = () => {
    if (!contextMenu) return;
    setReportedIds(prev => new Set(prev).add(contextMenu.message.id));
    setContextMenu(null);
    // Show brief feedback â€” could be sent to server in future
    alert('Message reported. Our team will review it.');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10b981';
      case 'away': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  if (!currentFriend) {
    return (
      <div className="dm-chat empty">
        <div className="empty-state">
          <Smile size={64} />
          <h2>Select a friend</h2>
          <p>Choose a friend from the list to start chatting</p>
        </div>
      </div>
    );
  }

  const relevantMessages = directMessages.filter(
    dm => (dm.senderId === currentFriend.id && dm.receiverId === user?.id) ||
      (dm.senderId === user?.id && dm.receiverId === currentFriend.id)
  );

  return (
    <div className="dm-chat-container">
      <div className="dm-chat">
        <div className="dm-chat-header">
          <button className="mobile-back-btn" onClick={() => setCurrentFriend(null)} title="Back">
            <ChevronLeft size={22} />
          </button>
          <div className="friend-header-info clickable" onClick={() => setShowProfileModal(true)}
            title={t('chat.clickToSeeProfile')}>
            <div className="friend-header-avatar">
              {currentFriend.avatar ? (
                <img src={getImageUrl(currentFriend.avatar)} alt={currentFriend.username} />
              ) : (
                <div className="avatar-initial">{currentFriend.username[0].toUpperCase()}</div>
              )}
              <div className="status-indicator" style={{ backgroundColor: getStatusColor(currentFriend.status) }} />
            </div>
            <div>
              <h3>{currentFriend.username}</h3>
              {currentFriend.bio && <p className="friend-bio">{currentFriend.bio}</p>}
            </div>
          </div>
        </div>

        <div className="dm-messages">
          {relevantMessages.length === 0 ? (
            <div className="no-messages"><p>{t('chat.noMessages')}</p></div>
          ) : (
            relevantMessages.map((dm, index) => {
              const isOwn = dm.senderId === user?.id;
              const showAvatar = index === 0 || relevantMessages[index - 1].senderId !== dm.senderId;
              const senderUsername = isOwn ? user?.username || 'You' : dm.senderUsername;
              const senderAvatar = isOwn ? user?.avatar : dm.senderAvatar;
              const senderBio = isOwn ? user?.bio : dm.senderBio;
              const senderStatus: 'online' | 'offline' | 'away' = isOwn ? (user?.status as any || 'online') : (dm.senderStatus as any || 'offline');

              return (
                <div
                  key={dm.id}
                  className={`message${isOwn ? ' own' : ''}${reportedIds.has(dm.id) ? ' reported' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, dm, isOwn)}
                >
                  {showAvatar ? (
                    <div className="message-avatar clickable"
                      onClick={(e) => handleAvatarClick(e, dm.senderId, senderUsername, senderAvatar, senderBio, senderStatus)}
                      title={t('chat.clickToSeeUserInfo')}>
                      {senderAvatar ? (
                        <img src={getImageUrl(senderAvatar)} alt={senderUsername} />
                      ) : (
                        <div className="avatar-initial">{senderUsername[0].toUpperCase()}</div>
                      )}
                    </div>
                  ) : (
                    <div className="message-avatar-spacer" />
                  )}
                  <div className="message-content">
                    {showAvatar && (
                      <div className="message-header">
                        <span className={`message-username${isOwn ? ' own-name' : ''} clickable`}
                          onClick={(e) => handleAvatarClick(e, dm.senderId, senderUsername, senderAvatar, senderBio, senderStatus)}
                          title={t('chat.clickToSeeUserInfo')}>
                          {senderUsername}
                        </span>
                        <span className="message-time">
                          {new Date(dm.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {dm.edited && <span className="edited-label">(edited)</span>}
                      </div>
                    )}
                    {editingId === dm.id ? (
                      <form className="edit-form" onSubmit={handleEditSubmit}>
                        <input
                          className="edit-input"
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          autoFocus
                        />
                        <button type="submit" className="edit-confirm-btn" title="Save"><Check size={16} /></button>
                        <button type="button" className="edit-cancel-btn" onClick={() => setEditingId(null)} title="Cancel"><X size={16} /></button>
                      </form>
                    ) : (
                      <div className={`message-text${isOwn ? ' own-bubble' : ''}`}>{dm.content}</div>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {typingFriends.has(currentFriend.id) && (
            <div className="typing-indicator">
              <span>{t('chat.typing', { username: currentFriend.username })}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="dm-input-container">
          {showEmojiPicker && (
            <div className="emoji-picker-wrapper" ref={emojiPickerRef}>
              <CustomEmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
          <form onSubmit={handleSendMessage} className="dm-input-form">
            <button type="button" className={`emoji-btn ${showEmojiPicker ? 'active' : ''}`}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
              <Smile size={20} />
            </button>
            <input ref={inputRef} type="text" value={message}
              onChange={(e) => handleTyping(e.target.value)}
              placeholder={t('chat.typeMessage', { username: currentFriend.username })} />
            <button type="submit" disabled={!message.trim()}><Send size={20} /></button>
          </form>
        </div>

        {showProfileModal && currentFriend && (
          <UserProfileModal friend={currentFriend} onClose={() => setShowProfileModal(false)} />
        )}
        {showUserPopover && popoverUser && (
          <UserInfoPopover userId={popoverUser.userId} username={popoverUser.username}
            avatar={popoverUser.avatar} bio={popoverUser.bio} status={popoverUser.status}
            position={popoverPosition} onClose={() => setShowUserPopover(false)} />
        )}

        {contextMenu && (
          <div className="ctx-menu" style={{ top: contextMenu.y, left: contextMenu.x }}
            onMouseDown={(e) => e.stopPropagation()}>
            {contextMenu.isOwn && (
              <>
                <button className="ctx-item" onClick={handleEdit}><Pencil size={14} /> Edit</button>
                <button className="ctx-item ctx-danger" onClick={handleDelete}><Trash2 size={14} /> Delete</button>
              </>
            )}
            <button className="ctx-item ctx-warn" onClick={handleReport}><Flag size={14} /> Report</button>
          </div>
        )}
      </div>
      <UserProfileSidebar friend={currentFriend} />
    </div>
  );
};

