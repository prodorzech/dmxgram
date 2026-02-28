import { useState, useEffect, useRef } from 'react';
import { Send, SmilePlus, Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import './ServerChat.css';

export function ServerChat() {
  const { t } = useTranslation();
  const { 
    currentServer, 
    currentChannel, 
    serverMessages, 
    addServerMessage,
    updateServerMessage,
    removeServerMessage,
    setServerMessages,
    token 
  } = useStore();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load messages when channel changes
  useEffect(() => {
    if (!currentServer || !currentChannel || !token) return;

    const loadMessages = async () => {
      try {
        setLoading(true);
        const messages = await api.getMessages(currentServer.id, currentChannel.id, token);
        setServerMessages(messages);
      } catch (error) {
        console.error('Failed to load messages:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [currentServer, currentChannel, token, setServerMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [serverMessages]);

  // Listen for new messages via Socket.IO
  useEffect(() => {
    if (!currentServer || !currentChannel) return;

    const handleNewMessage = (msg: any) => {
      addServerMessage(msg);
    };

    const handleEditMessage = (msg: any) => {
      updateServerMessage(msg.id, msg.content);
    };

    const handleDeleteMessage = (data: any) => {
      removeServerMessage(data.messageId);
    };

    socketService.on('message:new', handleNewMessage);
    socketService.on('message:edited', handleEditMessage);
    socketService.on('message:deleted', handleDeleteMessage);

    return () => {
      socketService.off('message:new', handleNewMessage);
      socketService.off('message:edited', handleEditMessage);
      socketService.off('message:deleted', handleDeleteMessage);
    };
  }, [currentChannel, addServerMessage, updateServerMessage, removeServerMessage]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !currentServer || !currentChannel || !token) return;

    const msgData = {
      serverId: currentServer.id,
      channelId: currentChannel.id,
      content: message,
    };

    socketService.emit('message:send', msgData);
    setMessage('');
    inputRef.current?.focus();
  };

  if (!currentServer || !currentChannel) {
    return (
      <div className="server-chat-empty">
        <p>{t('chat.selectChannelToChat')}</p>
      </div>
    );
  }

  return (
    <div className="server-chat">
      <div className="server-chat-header">
        <h2>#{currentChannel.name}</h2>
        {currentChannel.description && (
          <p className="channel-desc">{currentChannel.description}</p>
        )}
      </div>

      <div className="server-chat-messages">
        {loading ? (
          <div className="loading-messages">
            <p>{t('chat.loading')}</p>
          </div>
        ) : serverMessages.length === 0 ? (
          <div className="no-messages">
            <p>{t('chat.noMessages')}</p>
          </div>
        ) : (
          serverMessages.map((msg) => (
            <div key={msg.id} className="message-item">
              <div className="message-avatar">
                {msg.userAvatar ? (
                  <img src={msg.userAvatar} alt={msg.username} />
                ) : (
                  <div className="avatar-initial">{msg.username[0].toUpperCase()}</div>
                )}
              </div>
              <div className="message-content">
                <div className="message-header">
                  <span className="message-username">{msg.username}</span>
                  <span className="message-time">
                    {new Date(msg.createdAt).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="message-text">{msg.content}</div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="server-chat-input" onSubmit={handleSendMessage}>
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('chat.typeMessage')}
          className="message-input"
        />
        <button type="button" className="input-icon-btn" title={t('chat.attachFile')}>
          <Paperclip size={18} />
        </button>
        <button type="button" className="input-icon-btn" title={t('chat.sendEmoji')}>
          <SmilePlus size={18} />
        </button>
        <button
          type="submit"
          className="send-btn"
          disabled={!message.trim()}
          title={t('chat.sendMessage')}
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
