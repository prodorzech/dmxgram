import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Smile, ChevronLeft, Pencil, Trash2, Flag, X, Check, Paperclip, CornerUpLeft, Eraser, ShieldBan, ShieldOff, Copy, MoreVertical, Share2, Mic, Play, Pause, Phone, PhoneOff, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { useUI } from '../../context/UIContext';
import { api } from '../../services/api';
import { socketService } from '../../services/socket';
import { CustomEmojiPicker } from '../CustomEmojiPicker/CustomEmojiPicker';
import { UserProfileModal } from '../UserProfileModal/UserProfileModal';
import { UserInfoPopover } from '../UserInfoPopover/UserInfoPopover';
import { UserProfileSidebar } from '../UserProfileSidebar/UserProfileSidebar';
import { MediaLightbox } from '../MediaLightbox/MediaLightbox';
import { ReportModal } from '../ReportModal/ReportModal';
import { ForwardMessageModal } from '../ForwardMessageModal/ForwardMessageModal';
import { getImageUrl } from '../../utils/imageUrl';
import { DirectMessage, MessageAttachment } from '../../types';
import './DMChat.css';

/* ── Custom Voice Message Player ─────────────────────────────────────── */
interface VoicePlayerProps {
  src: string;
  label: string;
}
function VoicePlayer({ src, label }: VoicePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform] = useState<number[]>(() =>
    Array.from({ length: 32 }, () => 0.2 + Math.random() * 0.8)
  );
  const animRef = useRef<number>(0);

  const setupDevice = useCallback((el: HTMLAudioElement) => {
    const outDev = localStorage.getItem('dmx-audio-output');
    const outVol = parseInt(localStorage.getItem('dmx-output-volume') ?? '100', 10);
    el.volume = Math.min(outVol / 100, 1);
    if (outDev && outDev !== 'default' && typeof (el as any).setSinkId === 'function') {
      (el as any).setSinkId(outDev).catch(() => {});
    }
  }, []);

  useEffect(() => {
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const tick = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (!audioRef.current.paused) {
        animRef.current = requestAnimationFrame(tick);
      }
    }
  }, []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      setupDevice(el);
      el.play().catch(() => {});
      setPlaying(true);
      animRef.current = requestAnimationFrame(tick);
    } else {
      el.pause();
      setPlaying(false);
      cancelAnimationFrame(animRef.current);
    }
  };

  const handleBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
    setCurrentTime(el.currentTime);
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="voice-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
            setupDevice(audioRef.current);
          }
        }}
        onEnded={() => { setPlaying(false); setCurrentTime(0); cancelAnimationFrame(animRef.current); }}
      />
      <button type="button" className="voice-player-btn" onClick={togglePlay}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="voice-player-body">
        <div className="voice-player-waveform" onClick={handleBarClick}>
          {waveform.map((h, i) => {
            const filled = i / waveform.length <= progress;
            return (
              <div key={i} className={`voice-bar${filled ? ' filled' : ''}`}
                style={{ height: `${h * 100}%` }} />
            );
          })}
        </div>
        <div className="voice-player-info">
          <Mic size={12} className="voice-player-mic" />
          <span className="voice-player-label">{label}</span>
          <span className="voice-player-time">
            {playing || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

interface ContextMenu {
  x: number;
  y: number;
  message: DirectMessage;
  isOwn: boolean;
}

export const DMChat: React.FC = () => {
  const { t } = useTranslation();
  const { toast, confirm } = useUI();
  const { currentFriend, setCurrentFriend, directMessages, addDirectMessage, setDirectMessages,
    updateDirectMessage, updateDirectMessageReactions, removeDirectMessage, user, token, addTypingFriend, removeTypingFriend, typingFriends,
    blockedUserIds, removeBlockedUserId, friends, startOutgoingCall, callState } = useStore();
  const [message, setMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUserPopover, setShowUserPopover] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ x: 0, y: 0 });
  const [popoverUser, setPopoverUser] = useState<{
    userId: string; username: string; avatar?: string; bio?: string;
    banner?: string; status: 'online' | 'offline' | 'away'; badges?: string[];
    profileColorTop?: string; profileColorBottom?: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [lightboxAttachments, setLightboxAttachments] = useState<MessageAttachment[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [replyingTo, setReplyingTo] = useState<{ id: string; content: string; username: string } | null>(null);
  const [noPing, setNoPing] = useState(false);
  const [reportModalMessage, setReportModalMessage] = useState<DirectMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<DirectMessage | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearInput, setClearInput] = useState('');
  const [showChatMenu, setShowChatMenu] = useState(false);
  const chatMenuRef = useRef<HTMLDivElement>(null);
  const [reactionPicker, setReactionPicker] = useState<{ messageId: string; friendId: string; x: number; y: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number>();
  const pollIntervalRef = useRef<number>();
  const isNearBottomRef = useRef(true);
  const isFirstLoadRef = useRef(true);
  const pendingInstantScrollRef = useRef(false);
  const lastReceivedCountRef = useRef<number>(0);
  // Anti-spam: track timestamp of last N messages to detect burst sending
  const msgTimestampsRef = useRef<number[]>([]);
  const spamCooldownRef = useRef<number | null>(null);

  // ── Voice recording state ──────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [volumeLevels, setVolumeLevels] = useState<number[]>([0, 0, 0, 0, 0]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordingTimerRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Media message helpers ──────────────────────────────────────────────
  const MEDIA_PREFIX = '__DMX_MEDIA__:';
  const REPLY_PREFIX = '__DMX_REPLY__:';
  const FORWARD_PREFIX = '__DMX_FORWARD__:';
  const CALL_PREFIX = '__DMX_CALL__:';
  const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮'];

  const parseCallMessage = (content: string): { type: 'missed' | 'ended'; callType: 'voice' | 'video'; duration?: number; peerId: string; peerUsername: string } | null => {
    if (!content.startsWith(CALL_PREFIX)) return null;
    try { return JSON.parse(content.slice(CALL_PREFIX.length)); } catch { return null; }
  };

  const parseMessage = (content: string): {
    text: string;
    attachments: MessageAttachment[];
    replyToId?: string;
    replyToContent?: string;
    replyToUsername?: string;
    noPing?: boolean;
    forwarded?: boolean;
    forwardedFrom?: string;
  } => {
    const prefix = content.startsWith(MEDIA_PREFIX) ? MEDIA_PREFIX
      : content.startsWith(REPLY_PREFIX) ? REPLY_PREFIX
      : content.startsWith(FORWARD_PREFIX) ? FORWARD_PREFIX
      : null;
    if (prefix) {
      try {
        const parsed = JSON.parse(content.slice(prefix.length));
        return {
          text: parsed.text || '',
          attachments: parsed.attachments || [],
          replyToId: parsed.replyToId,
          replyToContent: parsed.replyToContent,
          replyToUsername: parsed.replyToUsername,
          noPing: parsed.noPing,
          forwarded: parsed.forwarded,
          forwardedFrom: parsed.forwardedFrom,
        };
      } catch {
        return { text: content, attachments: [] };
      }
    }
    return { text: content, attachments: [] };
  };

  const encodeMessage = (
    text: string,
    attachments: MessageAttachment[],
    reply?: { id: string; content: string; username: string } | null,
    noPingFlag?: boolean
  ): string => {
    // Plain text with no attachments and no reply — send as-is
    if (attachments.length === 0 && !reply) return text;
    const payload: Record<string, unknown> = { text, attachments };
    if (reply) {
      payload.replyToId = reply.id;
      payload.replyToContent = parseMessage(reply.content).text || reply.content;
      payload.replyToUsername = reply.username;
      payload.noPing = noPingFlag ?? false;
    }
    const prefix = attachments.length > 0 ? MEDIA_PREFIX : REPLY_PREFIX;
    return prefix + JSON.stringify(payload);
  };

  // ── Voice recording helpers ────────────────────────────────────────────
  const startRecording = async () => {
    try {
      // Use selected input device from settings if set
      const savedInputDevice = localStorage.getItem('dmx-audio-input');
      const audioConstraints: MediaStreamConstraints['audio'] =
        savedInputDevice && savedInputDevice !== 'default'
          ? { deviceId: { exact: savedInputDevice } }
          : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      streamRef.current = stream;

      // Set up analyser for volume visualisation
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      // MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.start();

      setIsRecording(true);
      setRecordingTime(0);

      // Timer
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Volume animation loop
      const updateVolume = () => {
        if (!analyserRef.current) return;
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        // Take 5 frequency bands for 5 dots
        const bands = 5;
        const bandSize = Math.floor(dataArray.length / bands);
        const levels: number[] = [];
        for (let i = 0; i < bands; i++) {
          let sum = 0;
          for (let j = i * bandSize; j < (i + 1) * bandSize; j++) {
            sum += dataArray[j];
          }
          levels.push(sum / bandSize / 255); // 0-1
        }
        setVolumeLevels(levels);
        animFrameRef.current = requestAnimationFrame(updateVolume);
      };
      animFrameRef.current = requestAnimationFrame(updateVolume);
    } catch {
      toast(t('chat.voiceMicError'), 'error');
    }
  };

  const stopRecording = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        resolve(blob);
      };
      recorder.stop();
      cleanupRecording();
    });
  };

  const cleanupRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    audioContextRef.current = null;
    analyserRef.current = null;
    mediaRecorderRef.current = null;
    streamRef.current = null;
    setIsRecording(false);
    setRecordingTime(0);
    setVolumeLevels([0, 0, 0, 0, 0]);
  };

  const handleCancelRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    cleanupRecording();
  };

  const handleSendVoice = async () => {
    if (!currentFriend || !token) return;
    const blob = await stopRecording();
    if (!blob || blob.size === 0) return;
    const file = new File([blob], 'voice-message.webm', { type: 'audio/webm' });
    setIsUploading(true);
    try {
      const { attachments } = await api.uploadChatFiles([file], token);
      const content = encodeMessage('', attachments, replyingTo, noPing);
      socketService.emit('dm:send', { friendId: currentFriend.id, content });
      setReplyingTo(null);
      setNoPing(false);
    } catch (err: any) {
      toast(err.message || 'Failed to upload voice message', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const formatRecordingTime = (secs: number): string => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Keep backward-compat alias (used for editing existing messages in the future)

  // Close emoji picker on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
        setShowEmojiPicker(false);
      }
      if (contextMenu) setContextMenu(null);
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(event.target as Node)) {
        setReactionPicker(null);
      }
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setShowChatMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker, contextMenu]);

  useEffect(() => {
    if (currentFriend) {
      isFirstLoadRef.current = true;
      isNearBottomRef.current = true;
      lastReceivedCountRef.current = 0;
      pendingInstantScrollRef.current = true;
      loadMessages();
      socketService.emit('dm:join', { friendId: currentFriend.id });

      // Poll every 2 s — each user runs their own local server so socket events
      // from the other party never arrive in real-time; polling the shared
      // Supabase DB is the reliable delivery mechanism.
      pollIntervalRef.current = window.setInterval(() => {
        loadMessages();
      }, 2000);

      // Re-join room after socket reconnects (rooms are lost on disconnect)
      const handleReconnect = () => {
        socketService.emit('dm:join', { friendId: currentFriend.id });
        loadMessages();
      };
      socketService.onConnect(handleReconnect);

      return () => {
        socketService.emit('dm:leave', { friendId: currentFriend.id });
        socketService.offConnect(handleReconnect);
        window.clearInterval(pollIntervalRef.current);
      };
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
    const handleReactionsUpdate = ({ messageId, reactions }: { messageId: string; reactions: { emoji: string; userIds: string[] }[] }) => {
      updateDirectMessageReactions(messageId, reactions);
    };
    const handleTypingStart = (data: { friendId: string; username: string }) => {
      if (currentFriend && data.friendId === currentFriend.id) addTypingFriend(data.friendId);
    };
    const handleTypingStop = (data: { friendId: string }) => { removeTypingFriend(data.friendId); };
    const handleCleared = (data: { friendId: string }) => {
      if (currentFriend && (data.friendId === currentFriend.id || data.friendId === user?.id)) {
        setDirectMessages([]);
        lastReceivedCountRef.current = 0;
      }
    };

    socketService.on('dm:new', handleNewDM);
    socketService.on('dm:edited', handleEdited);
    socketService.on('dm:deleted', handleDeleted);
    socketService.on('dm:reactions:update', handleReactionsUpdate);
    socketService.on('dm:typing:start', handleTypingStart);
    socketService.on('dm:typing:stop', handleTypingStop);
    socketService.on('dm:cleared', handleCleared);

    return () => {
      socketService.off('dm:new', handleNewDM);
      socketService.off('dm:edited', handleEdited);
      socketService.off('dm:deleted', handleDeleted);
      socketService.off('dm:reactions:update', handleReactionsUpdate);
      socketService.off('dm:typing:start', handleTypingStart);
      socketService.off('dm:typing:stop', handleTypingStop);
      socketService.off('dm:cleared', handleCleared);
    };
  }, [currentFriend, user]);

  useEffect(() => {
    if (!isFirstLoadRef.current && currentFriend && user) {
      const receivedCount = directMessages.filter(
        dm => dm.senderId === currentFriend.id && dm.receiverId === user.id
      ).length;
      lastReceivedCountRef.current = receivedCount;
    }
    if (isNearBottomRef.current) scrollToBottom();
  }, [directMessages]);

  const loadMessages = async () => {
    if (!currentFriend || !token) return;
    try {
      const messages = await api.getDirectMessages(currentFriend.id, token);
      // On first load always scroll to bottom; on subsequent polls preserve position
      if (isFirstLoadRef.current) {
        isNearBottomRef.current = true;
        isFirstLoadRef.current = false;
      }
      // Preserve reactions that came in via socket if server doesn't have the table yet
      const prevMsgs = useStore.getState().directMessages;
      const reactionCache = new Map(prevMsgs.map(m => [m.id, m.reactions]));
      messages.forEach((m: DirectMessage) => {
        if (!m.reactions?.length) {
          const cached = reactionCache.get(m.id);
          if (cached?.length) m.reactions = cached;
        }
      });
      setDirectMessages(messages);
    } catch (err) { console.error('Failed to load messages:', err); }
  };

  // Scroll only the messages container — never use scrollIntoView which can
  // propagate to parent containers and shift the entire app window.
  const scrollToBottom = (instant = false) => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const useInstant = instant || pendingInstantScrollRef.current;
    pendingInstantScrollRef.current = false;
    el.scrollTo({ top: el.scrollHeight, behavior: useInstant ? 'instant' as ScrollBehavior : 'smooth' });
  };

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    // Consider "near bottom" if within 120px of the bottom
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!message.trim() && attachedFiles.length === 0) || !currentFriend) return;

    // ── Anti-spam: max 5 messages within any 5-second window ──────────────
    const nowTs = Date.now();
    // If still in an active cooldown, block sending
    if (spamCooldownRef.current && nowTs < spamCooldownRef.current) {
      const remaining = Math.ceil((spamCooldownRef.current - nowTs) / 1000);
      toast(t('user.spamWarning', { seconds: remaining }), 'warning');
      return;
    }
    // Purge timestamps older than 5 s
    msgTimestampsRef.current = msgTimestampsRef.current.filter(t => nowTs - t < 5000);
    if (msgTimestampsRef.current.length >= 5) {
      // Triggered – cool down until the oldest stamp + 5s
      const cooldownUntil = msgTimestampsRef.current[0] + 5000;
      spamCooldownRef.current = cooldownUntil;
      const remaining = Math.ceil((cooldownUntil - nowTs) / 1000);
      toast(t('user.spamWarning', { seconds: remaining }), 'warning');
      return;
    }
    msgTimestampsRef.current.push(nowTs);
    spamCooldownRef.current = null;
    // ─────────────────────────────────────────────────────────────────────

    if (attachedFiles.length > 0) {
      // Upload files first, then send encoded message
      if (!token) return;
      setIsUploading(true);
      try {
        const { attachments } = await api.uploadChatFiles(attachedFiles, token);
        const content = encodeMessage(message.trim(), attachments, replyingTo, noPing);
        socketService.emit('dm:send', { friendId: currentFriend.id, content });
        setAttachedFiles([]);
        setMessage('');
      } catch (err: any) {
        toast(err.message || 'Failed to upload files', 'error');
      } finally {
        setIsUploading(false);
      }
    } else {
      const content = replyingTo
        ? encodeMessage(message.trim(), [], replyingTo, noPing)
        : message.trim();
      socketService.emit('dm:send', { friendId: currentFriend.id, content });
      setMessage('');
    }

    setReplyingTo(null);
    setNoPing(false);
    isNearBottomRef.current = true; // always scroll after sending
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const combined = [...attachedFiles, ...files];
    const totalBytes = combined.reduce((s, f) => s + f.size, 0);
    if (totalBytes > 20 * 1024 * 1024) {
      toast('Total file size must not exceed 20 MB', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setAttachedFiles(combined);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(it => it.type.startsWith('image/'));
    if (imageItems.length === 0) return;
    e.preventDefault();
    const files = imageItems.map(it => it.getAsFile()).filter(Boolean) as File[];
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files]);
    }
  };

  const openLightbox = (attachments: MessageAttachment[], index: number) => {
    setLightboxAttachments(attachments);
    setLightboxIndex(index);
  };

  const handleAvatarClick = (event: React.MouseEvent, userId: string, username: string,
    avatar?: string, bio?: string, status?: 'online' | 'offline' | 'away', badges?: string[], banner?: string, profileColorTop?: string, profileColorBottom?: string) => {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const POPOVER_W = 290;
    const POPOVER_H = bio ? 320 : 240;
    const x = Math.min(rect.left + rect.width + 10, window.innerWidth - POPOVER_W - 10);
    const y = Math.min(rect.top, window.innerHeight - POPOVER_H - 10);
    setPopoverUser({ userId, username, avatar, bio, banner, status: status || 'offline', badges, profileColorTop, profileColorBottom });
    setPopoverPosition({ x: Math.max(4, x), y: Math.max(4, y) });
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
    setReportModalMessage(contextMenu.message);
    setContextMenu(null);
  };

  const handleReact = (messageId: string, friendId: string, emoji: string) => {
    socketService.emit('dm:react', { friendId, messageId, emoji });
  };

  const handleCopyMessage = () => {
    if (!contextMenu) return;
    const text = parseMessage(contextMenu.message.content).text;
    if (text) navigator.clipboard.writeText(text);
    toast(t('chat.copied'), 'success');
    setContextMenu(null);
  };

  const handleOpenReactionPicker = (e: React.MouseEvent, messageId: string, friendId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const pickerW = 340;
    const pickerH = 400;
    const x = Math.min(rect.left, window.innerWidth - pickerW - 8);
    const y = rect.bottom + 6 + pickerH > window.innerHeight
      ? rect.top - pickerH - 6
      : rect.bottom + 6;
    setReactionPicker({ messageId, friendId, x, y });
  };

  const handleReportSubmit = async (category: string, reason: string) => {
    if (!reportModalMessage || !token) return;
    const msg = reportModalMessage;
    try {
      await api.reportMessage({
        messageId: msg.id,
        messageContent: msg.content,
        reportedUserId: msg.senderId,
        reportedUsername: msg.senderUsername,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        category,
        reason,
      }, token);
      setReportedIds(prev => new Set(prev).add(msg.id));
      toast(t('report.success'), 'success');
    } catch {
      toast(t('report.error'), 'error');
    }
    setReportModalMessage(null);
  };

  const handleForward = (friendIds: string[]) => {
    if (!forwardingMessage || !user) return;
    const parsed = parseMessage(forwardingMessage.content);
    const forwardPayload = {
      text: parsed.text,
      attachments: parsed.attachments,
      forwarded: true,
      forwardedFrom: forwardingMessage.senderUsername,
    };
    const content = FORWARD_PREFIX + JSON.stringify(forwardPayload);
    for (const friendId of friendIds) {
      socketService.emit('dm:send', { friendId, content });
    }
    toast(t('chat.forwardSuccess'), 'success');
    setForwardingMessage(null);
  };

  const handleClearChat = () => {
    const word = t('chat.clearChatWord');
    if (clearInput.trim() !== word) return;
    if (!currentFriend) return;
    socketService.emit('dm:clear', { friendId: currentFriend.id });
    setDirectMessages([]);
    lastReceivedCountRef.current = 0;
    setShowClearModal(false);
    setClearInput('');
    toast(t('chat.clearChatSuccess'), 'success');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return '#10b981';
      case 'away': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  if (!currentFriend) {
    const sortedFriends = [...friends].sort((a, b) => {
      const order = { online: 0, away: 1, offline: 2 };
      return (order[a.status] ?? 2) - (order[b.status] ?? 2);
    });

    return (
      <div className="dm-chat empty">
        {friends.length === 0 ? (
          <div className="empty-state">
            <Smile size={64} />
            <h2>{t('dashboard.nothingSelected')}</h2>
            <p>{t('dashboard.selectFriend')}</p>
          </div>
        ) : (
          <div className="welcome-friends">
            <div className="welcome-header">
              <Smile size={28} />
              <span>{t('dashboard.selectFriend')}</span>
            </div>
            <div className="welcome-friends-list">
              {sortedFriends.map(friend => (
                <div
                  key={friend.id}
                  className="welcome-friend-item"
                  onClick={() => setCurrentFriend(friend)}
                >
                  <div className="friend-avatar" style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
                    {friend.avatar ? (
                      <img src={getImageUrl(friend.avatar)} alt={friend.username}
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%', borderRadius: '50%',
                        background: 'var(--accent-primary)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, fontWeight: 600, color: 'white'
                      }}>{friend.username[0].toUpperCase()}</div>
                    )}
                    <span className={`welcome-status-dot ${friend.status}`} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {friend.username}
                    </div>
                    <div style={{ fontSize: 12, color: friend.status === 'online' ? '#10b981' : friend.status === 'away' ? '#f59e0b' : 'var(--text-muted)', marginTop: 2 }}>
                      {friend.status === 'online' ? t('friends.online') : friend.status === 'away' ? t('friends.away') : t('friends.offline')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
            </div>
            <div>
              <h3 style={
                currentFriend.profileColorTop && currentFriend.profileColorBottom
                  ? {
                      background: `linear-gradient(90deg, ${currentFriend.profileColorTop}, ${currentFriend.profileColorBottom})`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }
                  : undefined
              }>{currentFriend.username}</h3>
              <p className="friend-header-status">
                <span className="friend-header-status-dot" style={{ backgroundColor: getStatusColor(currentFriend.status) }} />
                {currentFriend.status === 'online' ? t('status.online') : currentFriend.status === 'away' ? t('status.away') : t('status.offline')}
              </p>
              {currentFriend.bio && <p className="friend-bio">{currentFriend.bio}</p>}
            </div>
          </div>
          <div className="dm-header-actions">
            <button
              className="dm-call-btn"
              onClick={() => startOutgoingCall({
                peerId: currentFriend.id,
                peerUsername: currentFriend.username,
                peerAvatar: currentFriend.avatar,
                callType: 'voice'
              })}
              disabled={callState !== 'idle'}
              title={t('call.voiceCall')}
            >
              <Phone size={18} />
            </button>
            <button
              className="dm-call-btn"
              onClick={() => startOutgoingCall({
                peerId: currentFriend.id,
                peerUsername: currentFriend.username,
                peerAvatar: currentFriend.avatar,
                callType: 'video'
              })}
              disabled={callState !== 'idle'}
              title={t('call.videoCall')}
            >
              <Video size={18} />
            </button>
          </div>
          <button
            className="clear-chat-btn"
            onClick={() => { setShowClearModal(true); setClearInput(''); }}
            title={t('chat.clearChat')}
            style={{ display: 'none' }}
          >
            <Eraser size={18} />
          </button>
        </div>

        <div className="dm-messages" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
          {relevantMessages.length === 0 ? (
            <div className="no-messages"><p>{t('chat.noMessages')}</p></div>
          ) : (
            <>
            <div className="dm-messages-spacer" />
            {relevantMessages.map((dm, index) => {
              const isOwn = dm.senderId === user?.id;
              const showAvatar = index === 0 || relevantMessages[index - 1].senderId !== dm.senderId;
              const senderUsername = isOwn ? user?.username || 'You' : dm.senderUsername;
              const senderAvatar = isOwn ? user?.avatar : dm.senderAvatar;
              const senderBio = isOwn ? user?.bio : dm.senderBio;
              const senderStatus: 'online' | 'offline' | 'away' = isOwn ? (user?.status as any || 'online') : (currentFriend?.status || 'offline');
              const senderBadges = isOwn ? user?.badges : currentFriend?.badges;
              const senderBanner = isOwn ? user?.banner : currentFriend?.banner;
              const senderProfileColorTop = isOwn ? user?.profileColorTop : currentFriend?.profileColorTop;
              const senderProfileColorBottom = isOwn ? user?.profileColorBottom : currentFriend?.profileColorBottom;

              // ── Call system message ──
              const callData = parseCallMessage(dm.content);
              if (callData) {
                const isMissed = callData.type === 'missed';
                const isVideoCall = callData.callType === 'video';
                const fmtDuration = (s: number) => {
                  const m = Math.floor(s / 60);
                  const sec = Math.floor(s % 60);
                  return `${m}:${sec.toString().padStart(2, '0')}`;
                };
                return (
                  <div key={dm.id} className={`call-system-message ${isMissed ? 'missed' : 'ended'}`}>
                    <div className="call-system-icon">
                      {isMissed ? <PhoneOff size={18} /> : (isVideoCall ? <Video size={18} /> : <Phone size={18} />)}
                    </div>
                    <div className="call-system-info">
                      <span className="call-system-text">
                        {isMissed
                          ? (isOwn
                              ? t('call.missedCallOutgoing', { name: callData.peerUsername })
                              : t('call.missedCallIncoming', { name: dm.senderUsername }))
                          : t('call.callEnded', { duration: fmtDuration(callData.duration || 0) })
                        }
                      </span>
                      <span className="call-system-time">
                        {new Date(dm.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {isMissed && !isOwn && (
                      <button
                        className="call-system-callback-btn"
                        onClick={() => startOutgoingCall({
                          peerId: dm.senderId,
                          peerUsername: dm.senderUsername,
                          peerAvatar: dm.senderAvatar,
                          callType: callData.callType
                        })}
                        disabled={callState !== 'idle'}
                        title={t('call.callback')}
                      >
                        <Phone size={16} />
                        <span>{t('call.callback')}</span>
                      </button>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={dm.id}
                  className={`message${isOwn ? ' own' : ''}${reportedIds.has(dm.id) ? ' reported' : ''}`}
                  onContextMenu={(e) => handleContextMenu(e, dm, isOwn)}
                >
                  {showAvatar ? (
                    <div className="message-avatar clickable"
                      onClick={(e) => handleAvatarClick(e, dm.senderId, senderUsername, senderAvatar, senderBio, senderStatus, senderBadges, senderBanner, senderProfileColorTop, senderProfileColorBottom)}
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
                          onClick={(e) => handleAvatarClick(e, dm.senderId, senderUsername, senderAvatar, senderBio, senderStatus, senderBadges, senderBanner, senderProfileColorTop, senderProfileColorBottom)}
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
                      <>
                        {(() => {
                          const parsed = parseMessage(dm.content);
                          return (
                            <>
                              {parsed.forwarded && (
                                <div className="msg-forwarded-label">
                                  <Share2 size={12} />
                                  <span>{t('chat.forwarded')}</span>
                                </div>
                              )}
                              {parsed.replyToId && (
                                <div className="msg-reply-snippet">
                                  <span className="msg-reply-arrow">↱</span>
                                  <span className="msg-reply-username">{parsed.replyToUsername}</span>
                                  <span className="msg-reply-text">{parsed.replyToContent}</span>
                                </div>
                              )}
                              {parsed.text && (
                                <div className={`message-text${isOwn ? ' own-bubble' : ''}`}>{parsed.text}</div>
                              )}
                              {parsed.attachments.length > 0 && (
                                <div className={`msg-attachments${parsed.attachments.length === 1 ? ' single' : ''}`}>
                                  {parsed.attachments.map((att, ai) => (
                                    att.mimetype.startsWith('audio/') ? (
                                      <VoicePlayer
                                        key={ai}
                                        src={getImageUrl(att.url)}
                                        label={t('chat.voiceNote')}
                                      />
                                    ) : att.mimetype.startsWith('video/') ? (
                                      <div key={ai} className="msg-media-item msg-video-item" onClick={() => openLightbox(parsed.attachments, ai)}>
                                        <video
                                          src={getImageUrl(att.url)}
                                          className="msg-video"
                                          preload="metadata"
                                          muted
                                        />
                                        <div className="msg-video-overlay">
                                          <div className="msg-play-icon">&#9654;</div>
                                        </div>
                                      </div>
                                    ) : (
                                      <img
                                        key={ai}
                                        src={getImageUrl(att.url)}
                                        alt={att.filename}
                                        className="msg-media-item msg-image-item"
                                        onClick={() => openLightbox(parsed.attachments, ai)}
                                        loading="lazy"
                                      />
                                    )
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {dm.reactions && dm.reactions.length > 0 && (
                          <div className="msg-reactions">
                            {dm.reactions.map(r => (
                              <button
                                key={r.emoji}
                                className={`reaction-bubble${r.userIds.includes(user?.id || '') ? ' own' : ''}`}
                                onClick={() => handleReact(dm.id, currentFriend.id, r.emoji)}
                                title={String(r.userIds.length)}
                              >
                                {r.emoji}
                                <span className="reaction-count">{r.userIds.length}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  {editingId !== dm.id && (
                    <div className="message-actions" onMouseDown={(e) => e.stopPropagation()}>
                      {QUICK_REACTIONS.map(emoji => (
                        <button
                          key={emoji}
                          className="reaction-quick-btn"
                          onClick={() => handleReact(dm.id, currentFriend.id, emoji)}
                          title={emoji}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        className="reaction-more-btn"
                        onClick={(e) => handleOpenReactionPicker(e, dm.id, currentFriend.id)}
                        title={t('chat.moreReactions')}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            </>
          )}

          {typingFriends.has(currentFriend.id) && (
            <div className="typing-indicator">
              <span>{t('chat.typing', { username: currentFriend.username })}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <div className="dm-input-container">
          {blockedUserIds.includes(currentFriend.id) ? (
            <div className="blocked-banner">
              <ShieldBan size={18} />
              <span>{t('chat.youBlockedUser', { username: currentFriend.username })}</span>
              <button className="unblock-inline-btn" onClick={async () => {
                if (!token) return;
                const ok = await confirm(t('friends.confirmUnblock', { username: currentFriend.username }));
                if (!ok) return;
                try {
                  await api.unblockUser(currentFriend.id, token);
                  removeBlockedUserId(currentFriend.id);
                  toast(t('friends.unblockedToast', { username: currentFriend.username }), 'success');
                } catch (err: any) {
                  toast(err.message || 'Failed to unblock', 'error');
                }
              }}>
                <ShieldOff size={14} /> {t('friends.unblock')}
              </button>
            </div>
          ) : (
            <>
          {showEmojiPicker && (
            <div className="emoji-picker-wrapper" ref={emojiPickerRef}>
              <CustomEmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
          {replyingTo && (
            <div className="reply-bar">
              <CornerUpLeft size={14} className="reply-bar-icon" />
              <span className="reply-bar-label">{t('report.replyTo')}</span>
              <span className="reply-bar-username">{replyingTo.username}</span>
              <span className="reply-bar-content">{parseMessage(replyingTo.content).text || '📎'}</span>
              <label className="reply-no-ping">
                <input
                  type="checkbox"
                  checked={noPing}
                  onChange={(e) => setNoPing(e.target.checked)}
                />
                {t('report.noPing')}
              </label>
              <button className="reply-bar-cancel" onClick={() => { setReplyingTo(null); setNoPing(false); }} title={t('report.cancelReply')}>
                <X size={14} />
              </button>
            </div>
          )}
          {attachedFiles.length > 0 && (            <div className="attachment-previews">
              {attachedFiles.map((file, i) => (
                <div key={i} className="attachment-preview-item">
                  {file.type.startsWith('video/') ? (
                    <div className="attachment-preview-video">
                      <span>&#9654;</span>
                    </div>
                  ) : (
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="attachment-preview-img"
                    />
                  )}
                  <span className="attachment-preview-name">{file.name}</span>
                  <button
                    className="attachment-preview-remove"
                    type="button"
                    onClick={() => handleRemoveFile(i)}
                    title="Remove"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {isRecording ? (
            <div className="dm-input-form voice-recording-bar">
              <button type="button" className="voice-cancel-btn" onClick={handleCancelRecording} title={t('chat.voiceCancel')}>
                <X size={20} />
              </button>
              <div className="voice-visualizer">
                {volumeLevels.map((level, i) => (
                  <span
                    key={i}
                    className="voice-dot"
                    style={{ transform: `scale(${0.5 + level * 1.5})` }}
                  />
                ))}
              </div>
              <span className="voice-timer">{formatRecordingTime(recordingTime)}</span>
              <button type="button" className="voice-send-btn" onClick={handleSendVoice} title={t('chat.voiceSend')}>
                <Send size={20} />
              </button>
            </div>
          ) : (
          <form onSubmit={handleSendMessage} className="dm-input-form" onPaste={handlePaste}>
            <button type="button" className={`emoji-btn ${showEmojiPicker ? 'active' : ''}`}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
              <Smile size={20} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <input ref={inputRef} type="text" value={message}
              onChange={(e) => handleTyping(e.target.value)}
              placeholder={t('chat.typeMessage', { username: currentFriend.username })}
              disabled={isUploading}
            />
            <button
              type="button"
              className="attach-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Attach files (max 20 MB total)"
            >
              <Paperclip size={20} />
            </button>
            <button type="submit" disabled={(!message.trim() && attachedFiles.length === 0) || isUploading}>
              {isUploading ? <span className="upload-spinner" /> : <Send size={20} />}
            </button>
            <div className="chat-more-menu" ref={chatMenuRef}>
              <button
                type="button"
                className="chat-more-btn"
                onClick={() => setShowChatMenu(v => !v)}
                title="Więcej opcji"
              >
                <MoreVertical size={20} />
              </button>
              {showChatMenu && (
                <div className="chat-more-dropdown">
                  <button
                    type="button"
                    className="chat-more-item"
                    onClick={() => { setShowChatMenu(false); startRecording(); }}
                  >
                    <Mic size={14} />
                    {t('chat.voiceMessage')}
                  </button>
                  <button
                    type="button"
                    className="chat-more-item danger"
                    onClick={() => { setShowChatMenu(false); setShowClearModal(true); setClearInput(''); }}
                  >
                    <Eraser size={14} />
                    {t('chat.clearChat')}
                  </button>
                </div>
              )}
            </div>
          </form>
          )}
            </>
          )}
        </div>

        {showProfileModal && currentFriend && (
          <UserProfileModal friend={currentFriend} onClose={() => setShowProfileModal(false)} />
        )}
        {showUserPopover && popoverUser && (
          <UserInfoPopover userId={popoverUser.userId} username={popoverUser.username}
            avatar={popoverUser.avatar} bio={popoverUser.bio} status={popoverUser.status}
            badges={popoverUser.badges} banner={popoverUser.banner}
            profileColorTop={popoverUser.profileColorTop} profileColorBottom={popoverUser.profileColorBottom}
            position={popoverPosition} onClose={() => setShowUserPopover(false)} />
        )}

        {contextMenu && (
          <div
            className="ctx-menu"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 160),
              left: Math.min(contextMenu.x, window.innerWidth - 170),
            }}
            onMouseDown={(e) => e.stopPropagation()}>
            <button className="ctx-item" onClick={() => {
              const msg = contextMenu.message;
              setReplyingTo({ id: msg.id, content: msg.content, username: msg.senderUsername });
              setContextMenu(null);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}><CornerUpLeft size={14} /> Reply</button>
            <button className="ctx-item" onClick={() => {
              setForwardingMessage(contextMenu.message);
              setContextMenu(null);
            }}><Share2 size={14} /> {t('chat.forward')}</button>
            {parseMessage(contextMenu.message.content).text && (
              <button className="ctx-item" onClick={handleCopyMessage}><Copy size={14} /> {t('chat.copy')}</button>
            )}
            {contextMenu.isOwn && (
              <>
                {!parseMessage(contextMenu.message.content).attachments.length && (
                  <button className="ctx-item" onClick={handleEdit}><Pencil size={14} /> Edit</button>
                )}
                <button className="ctx-item ctx-danger" onClick={handleDelete}><Trash2 size={14} /> Delete</button>
              </>
            )}
            {!contextMenu.isOwn && (
              <button className="ctx-item ctx-warn" onClick={handleReport}><Flag size={14} /> Report</button>
            )}
          </div>
        )}
      </div>
      <UserProfileSidebar friend={currentFriend} />

      {reactionPicker && (
        <div
          ref={reactionPickerRef}
          className="reaction-picker-popup"
          style={{ left: reactionPicker.x, top: reactionPicker.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <CustomEmojiPicker onEmojiClick={(emoji) => {
            handleReact(reactionPicker.messageId, reactionPicker.friendId, emoji);
            setReactionPicker(null);
          }} />
        </div>
      )}

      {lightboxAttachments && (
        <MediaLightbox
          attachments={lightboxAttachments}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxAttachments(null)}
        />
      )}

      {reportModalMessage && (
        <ReportModal
          senderUsername={reportModalMessage.senderUsername}
          onClose={() => setReportModalMessage(null)}
          onSubmit={handleReportSubmit}
        />
      )}

      {forwardingMessage && (
        <ForwardMessageModal
          friends={friends}
          onClose={() => setForwardingMessage(null)}
          onForward={handleForward}
        />
      )}

      {showClearModal && (
        <div className="modal-overlay" onClick={() => setShowClearModal(false)}>
          <div className="clear-chat-modal" onClick={(e) => e.stopPropagation()}>
            <div className="clear-chat-modal-header">
              <Eraser size={22} className="clear-chat-modal-icon" />
              <h3>{t('chat.clearChatTitle')}</h3>
              <button className="close-button" onClick={() => setShowClearModal(false)}><X size={20} /></button>
            </div>
            <p className="clear-chat-modal-desc">{t('chat.clearChatDesc')}</p>
            <input
              className="clear-chat-input"
              type="text"
              value={clearInput}
              onChange={(e) => setClearInput(e.target.value)}
              placeholder={t('chat.clearChatWord')}
              onKeyDown={(e) => { if (e.key === 'Enter') handleClearChat(); }}
              autoFocus
            />
            <div className="clear-chat-modal-actions">
              <button className="cancel-button" onClick={() => setShowClearModal(false)}>
                {t('user.cancel')}
              </button>
              <button
                className="clear-chat-confirm-btn"
                onClick={handleClearChat}
                disabled={clearInput.trim() !== t('chat.clearChatWord')}
              >
                <Trash2 size={16} />
                {t('chat.clearChatConfirmBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

