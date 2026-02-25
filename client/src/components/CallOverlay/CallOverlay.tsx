import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, Monitor, MonitorOff
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../../store';
import { socketService } from '../../services/socket';
import { getImageUrl } from '../../utils/imageUrl';
import './CallOverlay.css';

/* ── ICE servers ──────────────────────────────────────────────────────── */
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

/* ── Helper: format seconds → m:ss ───────────────────────────────────── */
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export function CallOverlay() {
  const { t } = useTranslation();
  const { user, callState, callInfo, callConnected, endCall, pendingCallOffer, clearPendingCallOffer } = useStore();

  // Debug: trace callState changes
  useEffect(() => {
    console.log('[CallOverlay] callState =', callState, callInfo ? `peer=${callInfo.peerId}` : '(no callInfo)');
  }, [callState, callInfo]);

  /* ── Refs ── */
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const callTimerRef = useRef<number>(0);
  const ringTimeoutRef = useRef<number>(0);
  const callDurationRef = useRef<number>(0);
  const systemMessageSentRef = useRef(false);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);
  const callInfoRef = useRef(callInfo);

  // Keep callInfoRef in sync — used by onicecandidate to avoid stale closures
  useEffect(() => { callInfoRef.current = callInfo; }, [callInfo]);

  /* ── State ── */
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  /* ── Audio analysers for speaking detection ── */
  const localAnalyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; anim: number } | null>(null);
  const remoteAnalyserRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; anim: number } | null>(null);

  /* ── Send call system message to chat ── */
  const sendCallSystemMessage = useCallback((type: 'missed' | 'ended', duration?: number) => {
    const info = useStore.getState().callInfo;
    if (systemMessageSentRef.current || !info) return;
    systemMessageSentRef.current = true;
    const payload = JSON.stringify({
      type,
      callType: info.callType,
      duration,
      peerId: info.peerId,
      peerUsername: info.peerUsername
    });
    socketService.emit('dm:send', {
      friendId: info.peerId,
      content: `__DMX_CALL__:${payload}`
    });
  }, []);

  /* ── Cleanup helper ── */
  const cleanup = useCallback(() => {
    clearInterval(callTimerRef.current);
    clearTimeout(ringTimeoutRef.current);

    // Stop ringtone
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current.currentTime = 0;
    }

    if (localAnalyserRef.current) {
      cancelAnimationFrame(localAnalyserRef.current.anim);
      localAnalyserRef.current.ctx.close().catch(() => {});
      localAnalyserRef.current = null;
    }
    if (remoteAnalyserRef.current) {
      cancelAnimationFrame(remoteAnalyserRef.current.anim);
      remoteAnalyserRef.current.ctx.close().catch(() => {});
      remoteAnalyserRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    iceCandidateQueue.current = [];
    callDurationRef.current = 0;
    systemMessageSentRef.current = false;
    setIsMuted(false);
    setIsCameraOn(false);
    setIsScreenSharing(false);
    setRemoteHasVideo(false);
    setIsSpeaking(false);
    setRemoteSpeaking(false);
    setCallDuration(0);
  }, []);

  /* ── Setup speaking detection on a stream ── */
  const setupSpeakingDetection = useCallback((stream: MediaStream, isLocal: boolean) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const ref = isLocal ? localAnalyserRef : remoteAnalyserRef;
      const setSpeaking = isLocal ? setIsSpeaking : setRemoteSpeaking;

      const check = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setSpeaking(avg > 12);
        if (ref.current) ref.current.anim = requestAnimationFrame(check);
      };
      ref.current = { ctx, analyser, anim: requestAnimationFrame(check) };
    } catch { /* no audio context */ }
  }, []);

  /* ── Create RTCPeerConnection ── */
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (e) => {
      // Use ref to always get the latest callInfo (avoids stale closure)
      const info = callInfoRef.current || useStore.getState().callInfo;
      if (e.candidate && info) {
        socketService.emit('call:ice-candidate', {
          targetUserId: info.peerId,
          candidate: e.candidate.toJSON()
        });
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;

      // Check if this track is video
      if (e.track.kind === 'video') {
        setRemoteHasVideo(true);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
        e.track.onended = () => setRemoteHasVideo(false);
        e.track.onmute = () => setRemoteHasVideo(false);
        e.track.onunmute = () => setRemoteHasVideo(true);
      }

      if (e.track.kind === 'audio') {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          const outDev = localStorage.getItem('dmx-audio-output');
          const outVol = parseInt(localStorage.getItem('dmx-output-volume') ?? '100', 10);
          remoteAudioRef.current.volume = Math.min(outVol / 100, 1);
          if (outDev && outDev !== 'default' && typeof (remoteAudioRef.current as any).setSinkId === 'function') {
            (remoteAudioRef.current as any).setSinkId(outDev).catch(() => {});
          }
        }
        setupSpeakingDetection(stream, false);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // Use store directly to avoid stale closure
        const st = useStore.getState();
        const info = st.callInfo;
        if (st.callState === 'connected') {
          sendCallSystemMessage('ended', callDurationRef.current);
        } else if (st.callState === 'outgoing') {
          sendCallSystemMessage('missed');
        }
        if (info) socketService.emit('call:hangup', { targetUserId: info.peerId });
        cleanup();
        st.endCall();
      }
    };

    pcRef.current = pc;
    return pc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupSpeakingDetection, cleanup, sendCallSystemMessage]);

  /* ── Get user media with saved device prefs ── */
  const getUserMedia = useCallback(async (withVideo: boolean) => {
    const inputDevice = localStorage.getItem('dmx-audio-input');
    const inputVol = parseInt(localStorage.getItem('dmx-input-volume') ?? '100', 10);

    const constraints: MediaStreamConstraints = {
      audio: inputDevice && inputDevice !== 'default'
        ? { deviceId: { exact: inputDevice } }
        : true,
      video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Apply input volume
    if (inputVol < 100) {
      // Volume is handled via gain in the audio context; for WebRTC we leave it as is
      // The gain node approach would require replacing the track
    }

    return stream;
  }, []);

  /* ── Start outgoing call ── */
  const startCall = useCallback(async () => {
    if (!callInfo || !user) return;
    console.log('[CallOverlay] startCall: peerId=', callInfo.peerId, 'type=', callInfo.callType);
    try {
      const stream = await getUserMedia(callInfo.callType === 'video');
      localStreamRef.current = stream;

      if (callInfo.callType === 'video') {
        setIsCameraOn(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }

      setupSpeakingDetection(stream, true);

      const pc = createPeerConnection();
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socketService.emit('call:offer', {
        targetUserId: callInfo.peerId,
        offer: pc.localDescription,
        callType: callInfo.callType,
        callerInfo: {
          userId: user.id,
          username: user.username,
          avatar: user.avatar
        }
      });

      // Ring timeout — 3 minutes
      ringTimeoutRef.current = window.setTimeout(() => {
        if (useStore.getState().callState === 'outgoing') {
          sendCallSystemMessage('missed');
          socketService.emit('call:hangup', { targetUserId: callInfo.peerId });
          cleanup();
          endCall();
        }
      }, 180000);

      // Ringtone is handled by the callState useEffect

    } catch (err) {
      console.error('Failed to start call:', err);
      cleanup();
      endCall();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callInfo, user, getUserMedia, createPeerConnection, setupSpeakingDetection, cleanup, endCall]);

  /* ── Reject / decline call ── */
  const rejectCall = useCallback(() => {
    if (callInfo) {
      socketService.emit('call:reject', { targetUserId: callInfo.peerId });
    }
    cleanup();
    endCall();
  }, [callInfo, cleanup, endCall]);

  /* ── Hang up ── */
  const handleHangup = useCallback(() => {
    const state = useStore.getState().callState;
    if (state === 'connected') {
      sendCallSystemMessage('ended', callDurationRef.current);
    } else if (state === 'outgoing') {
      sendCallSystemMessage('missed');
    }
    if (callInfo) {
      socketService.emit('call:hangup', { targetUserId: callInfo.peerId });
    }
    cleanup();
    endCall();
  }, [callInfo, cleanup, endCall, sendCallSystemMessage]);

  /* ── Toggle mic ── */
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  /* ── Toggle camera ── */
  const toggleCamera = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (isCameraOn) {
      // Turn off camera
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video');
      if (videoSender) {
        videoSender.track?.stop();
        pc.removeTrack(videoSender);
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      setIsCameraOn(false);

      // Renegotiate
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.emit('call:renegotiate', {
        targetUserId: callInfo?.peerId,
        offer: pc.localDescription
      });
    } else {
      // Turn on camera
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }
        });
        const videoTrack = videoStream.getVideoTracks()[0];
        pc.addTrack(videoTrack, localStreamRef.current || videoStream);

        if (localVideoRef.current) {
          const combined = new MediaStream([
            ...(localStreamRef.current?.getAudioTracks() || []),
            videoTrack
          ]);
          localVideoRef.current.srcObject = combined;
        }

        setIsCameraOn(true);

        // Renegotiate
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketService.emit('call:renegotiate', {
          targetUserId: callInfo?.peerId,
          offer: pc.localDescription
        });
      } catch {
        console.error('Cannot access camera');
      }
    }
  }, [isCameraOn, callInfo]);

  /* ── Toggle screen share ── */
  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (isScreenSharing) {
      // Stop screen share
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;

      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track?.kind === 'video' && s.track !== localStreamRef.current?.getVideoTracks()[0]);
      if (videoSender) pc.removeTrack(videoSender);

      setIsScreenSharing(false);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketService.emit('call:renegotiate', {
        targetUserId: callInfo?.peerId,
        offer: pc.localDescription
      });
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: { ideal: 3840 },
            height: { ideal: 2160 },
            frameRate: { ideal: 120 }
          },
          audio: true
        });
        screenStreamRef.current = screenStream;

        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace video sender if camera is on, otherwise add new track
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, screenStream);
        }

        // Also send screen audio if available
        const screenAudioTracks = screenStream.getAudioTracks();
        screenAudioTracks.forEach(track => {
          pc.addTrack(track, screenStream);
        });

        setIsScreenSharing(true);

        // If user stops sharing using browser UI
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
          // Restore camera if it was on
          if (isCameraOn && localStreamRef.current) {
            const camTrack = localStreamRef.current.getVideoTracks()[0];
            if (camTrack && videoSender) {
              videoSender.replaceTrack(camTrack);
            }
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socketService.emit('call:renegotiate', {
          targetUserId: callInfo?.peerId,
          offer: pc.localDescription
        });
      } catch {
        console.error('Screen share cancelled or failed');
      }
    }
  }, [isScreenSharing, callInfo, isCameraOn]);

  /* ══════════════════════════════════════════════════════════════════════
     SOCKET EVENT LISTENERS
     ══════════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    console.log('[CallOverlay] Registering socket listeners (answer, ice, hangup, reject, busy, renegotiate)');

    const handleAnswer = async (data: { answererId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));

      clearTimeout(ringTimeoutRef.current);

      // Ringtone is stopped by the callState useEffect when state becomes 'connected'
      callConnected();

      // Start timer
      callTimerRef.current = window.setInterval(() => {
        setCallDuration(prev => {
          callDurationRef.current = prev + 1;
          return prev + 1;
        });
      }, 1000);
    };

    const handleIceCandidate = async (data: { fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } else {
        iceCandidateQueue.current.push(data.candidate);
      }
    };

    const handleHangupEvent = () => {
      // Peer hung up — if we were connected, they already sent the system message
      // If we were ringing (incoming), this is a missed call from our perspective
      // but the caller already sent the missed message on their timeout/cancel
      cleanup();
      endCall();
    };

    const handleReject = () => {
      // Callee rejected our call — send missed call message
      sendCallSystemMessage('missed');
      cleanup();
      endCall();
    };

    const handleBusy = () => {
      cleanup();
      endCall();
    };

    const handleRenegotiate = async (data: { fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketService.emit('call:renegotiate-answer', {
        targetUserId: data.fromUserId,
        answer: pc.localDescription
      });
    };

    const handleRenegotiateAnswer = async (data: { fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      const pc = pcRef.current;
      if (!pc) return;
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    };

    socketService.on('call:answer', handleAnswer);
    socketService.on('call:ice-candidate', handleIceCandidate);
    socketService.on('call:hangup', handleHangupEvent);
    socketService.on('call:reject', handleReject);
    socketService.on('call:busy', handleBusy);
    socketService.on('call:renegotiate', handleRenegotiate);
    socketService.on('call:renegotiate-answer', handleRenegotiateAnswer);

    return () => {
      socketService.off('call:answer', handleAnswer);
      socketService.off('call:ice-candidate', handleIceCandidate);
      socketService.off('call:hangup', handleHangupEvent);
      socketService.off('call:reject', handleReject);
      socketService.off('call:busy', handleBusy);
      socketService.off('call:renegotiate', handleRenegotiate);
      socketService.off('call:renegotiate-answer', handleRenegotiateAnswer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup, endCall, callConnected, sendCallSystemMessage]);

  /* ── Start the outgoing call once state is set ── */
  useEffect(() => {
    if (callState === 'outgoing' && callInfo && !pcRef.current) {
      console.log('[CallOverlay] Triggering startCall for outgoing call');
      startCall();
    }
  }, [callState, callInfo, startCall]);

  /* ── Process pending offer from App-level call:offer listener ── */
  useEffect(() => {
    if (!pendingCallOffer || callState !== 'incoming') return;
    console.log('[CallOverlay] Processing pending call offer from', pendingCallOffer.callerId);
    try {
      const pc = createPeerConnection();
      pc.setRemoteDescription(new RTCSessionDescription(pendingCallOffer.offer))
        .then(() => console.log('[CallOverlay] Remote description set successfully'))
        .catch((err: any) => console.error('[CallOverlay] setRemoteDescription error:', err));
    } catch (err) {
      console.error('[CallOverlay] createPeerConnection error:', err);
    }
    clearPendingCallOffer();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCallOffer, callState]);

  /* ── When accepting: create answer ── */
  const handleAccept = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !callInfo) return;
    console.log('[CallOverlay] handleAccept: peerId=', callInfo.peerId);

    // Ringtone is stopped by callState useEffect when state becomes 'connected'

    try {
      const stream = await getUserMedia(callInfo.callType === 'video');
      localStreamRef.current = stream;

      if (callInfo.callType === 'video') {
        setIsCameraOn(true);
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }

      setupSpeakingDetection(stream, true);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Process queued ICE candidates
      for (const candidate of iceCandidateQueue.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidateQueue.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketService.emit('call:answer', {
        targetUserId: callInfo.peerId,
        answer: pc.localDescription
      });

      callConnected();

      // Start timer
      callTimerRef.current = window.setInterval(() => {
        setCallDuration(prev => {
          callDurationRef.current = prev + 1;
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Failed to accept:', err);
      rejectCall();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callInfo, getUserMedia, setupSpeakingDetection, callConnected, rejectCall]);

  /* ── Ringtone playback — driven by callState changes ── */
  useEffect(() => {
    const audio = ringtoneRef.current;
    if (!audio) return;

    if (callState === 'incoming' || callState === 'outgoing') {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [callState]);

  /* ══════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════ */

  const peerAvatar = callInfo?.peerAvatar ? getImageUrl(callInfo.peerAvatar) : null;
  const myAvatar = user?.avatar ? getImageUrl(user.avatar) : null;

  const overlay = callState !== 'idle' && callInfo ? (
    <div className={`call-overlay ${callState}`}>

      {/* ── RINGING / OUTGOING ── */}
      {(callState === 'outgoing' || callState === 'incoming') && (
        <div className="call-ringing">
          <div className="call-ringing-bg" />
          <div className="call-ringing-content">
            {/* Big caller avatar with pulse rings */}
            <div className="call-main-avatar">
              {(callState === 'incoming' ? peerAvatar : myAvatar) ? (
                <img
                  src={(callState === 'incoming' ? peerAvatar : myAvatar)!}
                  alt=""
                  className="call-avatar call-avatar-big"
                />
              ) : (
                <div className="call-avatar call-avatar-initial call-avatar-big">
                  {(callState === 'incoming'
                    ? callInfo.peerUsername?.[0]
                    : user?.username?.[0]
                  || '?').toUpperCase()}
                </div>
              )}
              <div className="call-pulse-ring" />
              <div className="call-pulse-ring delay" />
            </div>

            {/* Name + status */}
            <div className="call-ringing-info">
              <h3>
                {callState === 'outgoing'
                  ? t('call.calling', { name: callInfo.peerUsername })
                  : t('call.incomingFrom', { name: callInfo.peerUsername })
                }
              </h3>
              <p className="call-type-label">
                {callInfo.callType === 'video' ? t('call.videoCall') : t('call.voiceCall')}
              </p>
            </div>

            {/* Action buttons with labels */}
            <div className="call-ringing-actions">
              {callState === 'incoming' && (
                <button className="call-action-btn accept" onClick={handleAccept}>
                  <span className="call-btn-icon"><Phone size={24} /></span>
                  <span className="call-btn-label">{t('call.accept')}</span>
                </button>
              )}
              <button
                className="call-action-btn decline"
                onClick={callState === 'incoming' ? rejectCall : handleHangup}
              >
                <span className="call-btn-icon"><PhoneOff size={24} /></span>
                <span className="call-btn-label">{callState === 'incoming' ? t('call.decline') : t('call.cancel')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONNECTED CALL ── */}
      {callState === 'connected' && (
        <div className="call-connected">
          {/* Video area */}
          <div className="call-video-area">
            {/* Remote video (full) */}
            {remoteHasVideo && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="call-remote-video"
              />
            )}

            {/* If no remote video, show avatars */}
            {!remoteHasVideo && (
              <div className="call-avatars-display">
                <div className={`call-avatar-wrapper big${remoteSpeaking ? ' speaking' : ''}`}>
                  {peerAvatar ? (
                    <img src={peerAvatar} alt="" className="call-avatar" />
                  ) : (
                    <div className="call-avatar call-avatar-initial big">
                      {(callInfo.peerUsername?.[0] || '?').toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Local video (PiP) */}
            {isCameraOn && (
              <div className={`call-local-pip${isSpeaking ? ' speaking' : ''}`}>
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="call-local-video"
                />
              </div>
            )}
          </div>

          {/* Call info bar */}
          <div className="call-info-bar">
            <span className="call-peer-name">{callInfo.peerUsername}</span>
            <span className="call-timer">{fmtTime(callDuration)}</span>
          </div>

          {/* Controls */}
          <div className="call-controls">
            <button
              className={`call-ctrl-btn${isMuted ? ' active' : ''}`}
              onClick={toggleMute}
              title={isMuted ? t('call.unmute') : t('call.mute')}
            >
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              className={`call-ctrl-btn${isCameraOn ? ' active' : ''}`}
              onClick={toggleCamera}
              title={isCameraOn ? t('call.cameraOff') : t('call.cameraOn')}
            >
              {isCameraOn ? <Video size={20} /> : <VideoOff size={20} />}
            </button>
            <button
              className={`call-ctrl-btn${isScreenSharing ? ' active' : ''}`}
              onClick={toggleScreenShare}
              title={isScreenSharing ? t('call.stopScreenShare') : t('call.screenShare')}
            >
              {isScreenSharing ? <Monitor size={20} /> : <MonitorOff size={20} />}
            </button>
            <button
              className="call-ctrl-btn hangup"
              onClick={handleHangup}
              title={t('call.hangUp')}
            >
              <PhoneOff size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      {/* Audio elements — always at FIXED tree position, never remounted */}
      <audio ref={remoteAudioRef} autoPlay style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />
      <audio ref={ringtoneRef} src="/ringtone.mp3" loop preload="auto" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} />
      {overlay}
    </>
  );
}
