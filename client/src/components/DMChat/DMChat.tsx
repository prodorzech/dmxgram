import React, { useState, useEffect, useRef } from 'react';
import { Send, Smile, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { CustomEmojiPicker } from '../CustomEmojiPicker/CustomEmojiPicker';
import { UserProfileModal } from '../UserProfileModal/UserProfileModal';
import { UserInfoPopover } from '../UserInfoPopover/UserInfoPopover';
import { UserProfileSidebar } from '../UserProfileSidebar/UserProfileSidebar';
import { getImageUrl } from '../../utils/imageUrl';
import './DMChat.css';

export const DMChat: React.FC = () => {
  const { t } = useTranslation();
  const { currentFriend, setCurrentFriend, directMessages, addDirectMessage, setDirectMessages, user, token, addTypingFriend, removeTypingFriend, typingFriends } = useStore();
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserPopover, setShowUserPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const [popoverUser, setPopoverUser] = useState<{
    userId: string;
    username: string;
    avatar?: string;
    bio?: string;
    status: 'online' | 'offline' | 'away';
  } | null>(null);
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
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  useEffect(() => {
    if (currentFriend) {
      loadMessages();
      // Join DM room
      socketService.emit('dm:join', { friendId: currentFriend.id });

      return () => {
        socketService.emit('dm:leave', { friendId: currentFriend.id });
      };
    }
  }, [currentFriend]);

  useEffect(() => {
    // Listen for new DMs
    const handleNewDM = (dm: any) => {
      if (
        currentFriend &&
        ((dm.senderId === currentFriend.id && dm.receiverId === user?.id) ||
          (dm.senderId === user?.id && dm.receiverId === currentFriend.id))
      ) {
        addDirectMessage(dm);
      }
    };

    const handleTypingStart = (data: { friendId: string; username: string }) => {
      if (currentFriend && data.friendId === currentFriend.id) {
        addTypingFriend(data.friendId);
      }
    };

    const handleTypingStop = (data: { friendId: string }) => {
      removeTypingFriend(data.friendId);
    };

    socketService.on('dm:new', handleNewDM);
    socketService.on('dm:typing:start', handleTypingStart);
    socketService.on('dm:typing:stop', handleTypingStop);

    return () => {
      socketService.off('dm:new', handleNewDM);
      socketService.off('dm:typing:start', handleTypingStart);
      socketService.off('dm:typing:stop', handleTypingStop);
    };
  }, [currentFriend, user]);

  useEffect(() => {
    scrollToBottom();
  }, [directMessages]);

  const loadMessages = async () => {
    if (!currentFriend || !token) return;
    try {
      const messages = await api.getDirectMessages(currentFriend.id, token);
      setDirectMessages(messages);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !currentFriend) return;

    socketService.emit('dm:send', {
      friendId: currentFriend.id,
      content: message.trim()
    });

    setMessage('');
    setShowEmojiPicker(false);
    
    // Stop typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socketService.emit('dm:typing:stop', { friendId: currentFriend.id });
  };

  const handleTyping = (value: string) => {
    setMessage(value);

    if (!currentFriend) return;

    // Emit typing start
    socketService.emit('dm:typing:start', { friendId: currentFriend.id });

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing
    typingTimeoutRef.current = window.setTimeout(() => {
      socketService.emit('dm:typing:stop', { friendId: currentFriend.id });
    }, 2000);
  };

  const handleEmojiClick = (emoji: string) => {
    setMessage(prev => prev + emoji);
    inputRef.current?.focus();
  };

  const handleAvatarClick = (event: React.MouseEvent, userId: string, username: string, avatar?: string, bio?: string, status?: 'online' | 'offline' | 'away') => {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const x = rect.left + rect.width + 10;
    const y = rect.top;

    setPopoverUser({
      userId,
      username,
      avatar,
      bio,
      status: status || 'offline'
    });
    setPopoverPosition({ x, y });
    setShowUserPopover(true);
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
          <h2>Wybierz znajomego</h2>
          <p>Wybierz znajomego z listy, aby rozpocząć rozmowę</p>
        </div>
      </div>
    );
  }

  const relevantMessages = directMessages.filter(
    dm =>
      (dm.senderId === currentFriend.id && dm.receiverId === user?.id) ||
      (dm.senderId === user?.id && dm.receiverId === currentFriend.id)
  );

  return (
    <div className="dm-chat-container">
      <div className="dm-chat">
        <div className="dm-chat-header">
          <button className="mobile-back-btn" onClick={() => setCurrentFriend(null)} title="Wróć do listy">
            <ChevronLeft size={22} />
          </button>
        <div 
          className="friend-header-info clickable" 
          onClick={() => setShowProfileModal(true)}
          title={t('chat.clickToSeeProfile')}
        >
          <div className="friend-header-avatar">
            {currentFriend.avatar ? (
              <img src={getImageUrl(currentFriend.avatar)} alt={currentFriend.username} />
            ) : (
              <div className="avatar-initial">{currentFriend.username[0].toUpperCase()}</div>
            )}
            <div
              className="status-indicator"
              style={{ backgroundColor: getStatusColor(currentFriend.status) }}
            />
          </div>
          <div>
            <h3>{currentFriend.username}</h3>
            {currentFriend.bio && <p className="friend-bio">{currentFriend.bio}</p>}
          </div>
        </div>
      </div>

      <div className="dm-messages">
        {relevantMessages.length === 0 ? (
          <div className="no-messages">
            <p>{t('chat.noMessages')}</p>
          </div>
        ) : (
          relevantMessages.map((dm, index) => {
            const isOwn = dm.senderId === user?.id;
            const showAvatar = index === 0 || relevantMessages[index - 1].senderId !== dm.senderId;

            return (
              <div key={dm.id} className={`message ${isOwn ? 'own' : ''}`}>
                {!isOwn && showAvatar && (
                  <div 
                    className="message-avatar clickable" 
                    onClick={(e) => handleAvatarClick(e, dm.senderId, dm.senderUsername, dm.senderAvatar, dm.senderBio, dm.senderStatus)}
                    title={t('chat.clickToSeeUserInfo')}
                  >
                    {dm.senderAvatar ? (
                      <img src={getImageUrl(dm.senderAvatar)} alt={dm.senderUsername} />
                    ) : (
                      <div className="avatar-initial">{dm.senderUsername[0].toUpperCase()}</div>
                    )}
                  </div>
                )}
                {!isOwn && !showAvatar && <div className="message-avatar-spacer" />}
                <div className="message-content">
                  {!isOwn && showAvatar && (
                    <div className="message-header">
                      <span 
                        className="message-username clickable"
                        onClick={(e) => handleAvatarClick(e, dm.senderId, dm.senderUsername, dm.senderAvatar, dm.senderBio, dm.senderStatus)}
                        title={t('chat.clickToSeeUserInfo')}
                      >
                        {dm.senderUsername}
                      </span>
                      <span className="message-time">
                        {new Date(dm.createdAt).toLocaleTimeString('pl-PL', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  )}
                  <div className="message-text">{dm.content}</div>
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
          <button
            type="button"
            className={`emoji-btn ${showEmojiPicker ? 'active' : ''}`}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile size={20} />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={message}
            onChange={(e) => handleTyping(e.target.value)}
            placeholder={t('chat.typeMessage', { username: currentFriend.username })}
          />
          <button type="submit" disabled={!message.trim()}>
            <Send size={20} />
          </button>
        </form>
      </div>
      {showProfileModal && currentFriend && (
        <UserProfileModal
          friend={currentFriend}
          onClose={() => setShowProfileModal(false)}
        />
      )}
      {showUserPopover && popoverUser && (
        <UserInfoPopover
          userId={popoverUser.userId}
          username={popoverUser.username}
          avatar={popoverUser.avatar}
          bio={popoverUser.bio}
          status={popoverUser.status}
          position={popoverPosition}
          onClose={() => setShowUserPopover(false)}
        />
      )}
      </div>
      <UserProfileSidebar friend={currentFriend} />
    </div>
  );
};
