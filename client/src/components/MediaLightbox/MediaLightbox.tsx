import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight, Download,
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2
} from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';
import { MessageAttachment } from '../../types';
import './MediaLightbox.css';

interface MediaLightboxProps {
  attachments: MessageAttachment[];
  initialIndex?: number;
  onClose: () => void;
}

function formatTime(sec: number): string {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isVideo(mimetype: string): boolean {
  return mimetype.startsWith('video/');
}

function isGif(mimetype: string): boolean {
  return mimetype === 'image/gif';
}

export const MediaLightbox: React.FC<MediaLightboxProps> = ({
  attachments,
  initialIndex = 0,
  onClose,
}) => {
  const [index, setIndex] = useState(initialIndex);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoVolume, setVideoVolume] = useState(100); // 0-100
  const [videoTime, setVideoTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoFullscreen, setVideoFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimerRef = useRef<number>();

  const current = attachments[index];
  const isCurrentVideo = isVideo(current.mimetype);

  const prev = useCallback(() => {
    setIndex(i => (i === 0 ? attachments.length - 1 : i - 1));
    setVideoPlaying(false);
    setVideoTime(0);
  }, [attachments.length]);

  const next = useCallback(() => {
    setIndex(i => (i === attachments.length - 1 ? 0 : i + 1));
    setVideoPlaying(false);
    setVideoTime(0);
  }, [attachments.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === ' ' && isCurrentVideo) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isCurrentVideo, next, onClose, prev]);

  // Auto-hide video controls
  const resetControlsTimer = () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    setShowControls(true);
    controlsTimerRef.current = window.setTimeout(() => setShowControls(false), 3000);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const handleVideoClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    resetControlsTimer();
    togglePlay();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const t = parseFloat(e.target.value);
    videoRef.current.currentTime = t;
    setVideoTime(t);
  };

  const handleDownload = async () => {
    const url = getImageUrl(current.url);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = current.filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // fallback: open in new tab
      window.open(url, '_blank');
    }
  };

  const toggleVideoFullscreen = () => {
    if (!videoRef.current) return;
    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen().catch(() => {});
      setVideoFullscreen(true);
    } else {
      document.exitFullscreen();
      setVideoFullscreen(false);
    }
  };

  return (
    <div className="lb-overlay" onClick={onClose}>
      {/* Top bar */}
      <div className="lb-top-bar" onClick={e => e.stopPropagation()}>
        <div className="lb-file-info">
          <span className="lb-filename">{current.filename}</span>
          <span className="lb-filesize">{formatBytes(current.size)}</span>
          {attachments.length > 1 && (
            <span className="lb-counter">{index + 1} / {attachments.length}</span>
          )}
        </div>
        <div className="lb-top-actions">
          <button className="lb-btn" onClick={e => { e.stopPropagation(); handleDownload(); }} title="Download">
            <Download size={18} />
          </button>
          <button className="lb-btn lb-close-btn" onClick={e => { e.stopPropagation(); onClose(); }} title="Close (Esc)">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Navigation */}
      {attachments.length > 1 && (
        <>
          <button className="lb-nav lb-nav-prev" onClick={e => { e.stopPropagation(); prev(); }} title="Previous (←)">
            <ChevronLeft size={28} />
          </button>
          <button className="lb-nav lb-nav-next" onClick={e => { e.stopPropagation(); next(); }} title="Next (→)">
            <ChevronRight size={28} />
          </button>
        </>
      )}

      {/* Media */}
      <div className="lb-media-wrapper" onClick={e => e.stopPropagation()}>
        {isCurrentVideo ? (
          <div
            className={`lb-video-container ${showControls ? 'controls-visible' : ''}`}
            onMouseMove={resetControlsTimer}
          >
            <video
              ref={videoRef}
              src={getImageUrl(current.url)}
              className="lb-video"
              onClick={handleVideoClick}
              onPlay={() => setVideoPlaying(true)}
              onPause={() => setVideoPlaying(false)}
              onTimeUpdate={() => setVideoTime(videoRef.current?.currentTime || 0)}
              onDurationChange={() => setVideoDuration(videoRef.current?.duration || 0)}
              preload="metadata"
              playsInline
            />

            {/* Play/pause overlay on click */}
            <div className={`lb-play-overlay ${!videoPlaying ? 'visible' : ''}`} onClick={handleVideoClick}>
              <div className="lb-play-circle">
                {videoPlaying ? <Pause size={32} /> : <Play size={32} />}
              </div>
            </div>

            {/* Video controls bar */}
            <div className="lb-video-controls" onClick={e => e.stopPropagation()}>
              <button className="lb-ctrl-btn" onClick={togglePlay} title={videoPlaying ? 'Pause (Space)' : 'Play (Space)'}>
                {videoPlaying ? <Pause size={16} /> : <Play size={16} />}
              </button>

              <span className="lb-time">{formatTime(videoTime)}</span>

              <input
                className="lb-seek"
                type="range"
                min={0}
                max={videoDuration || 100}
                step={0.1}
                value={videoTime}
                onChange={handleSeek}
                onClick={e => e.stopPropagation()}
              />

              <span className="lb-time">{formatTime(videoDuration)}</span>

              <button className="lb-ctrl-btn" onClick={() => {
                const muted = videoVolume > 0;
                const newVol = muted ? 0 : 100;
                setVideoVolume(newVol);
                if (videoRef.current) videoRef.current.volume = newVol / 100;
              }} title={videoVolume === 0 ? 'Unmute' : 'Mute'}>
                {videoVolume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <input
                className="lb-volume"
                type="range"
                min={0}
                max={100}
                step={1}
                value={videoVolume}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setVideoVolume(v);
                  if (videoRef.current) videoRef.current.volume = v / 100;
                }}
                onClick={(e) => e.stopPropagation()}
                title={`Volume: ${videoVolume}%`}
              />

              <button className="lb-ctrl-btn" onClick={toggleVideoFullscreen} title="Fullscreen">
                {videoFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
            </div>
          </div>
        ) : (
          <img
            className={`lb-image${isGif(current.mimetype) ? ' lb-gif' : ''}`}
            src={getImageUrl(current.url)}
            alt={current.filename}
            draggable={false}
          />
        )}
      </div>

      {/* Thumbnails strip */}
      {attachments.length > 1 && (
        <div className="lb-thumbs" onClick={e => e.stopPropagation()}>
          {attachments.map((att, i) => (
            <button
              key={i}
              className={`lb-thumb-btn${i === index ? ' active' : ''}`}
              onClick={() => { setIndex(i); setVideoPlaying(false); setVideoTime(0); }}
            >
              {isVideo(att.mimetype) ? (
                <div className="lb-thumb-video-icon">
                  <Play size={16} />
                </div>
              ) : (
                <img src={getImageUrl(att.url)} alt={att.filename} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
