import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './UpdateNotification.css';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

declare global {
  interface Window {
    electronAPI?: {
      onUpdateAvailable:     (cb: (info: UpdateInfo) => void) => void;
      onUpdateProgress:      (cb: (p: DownloadProgress) => void) => void;
      onUpdateDownloaded:    (cb: (info: any) => void) => void;
      downloadUpdate:        () => void;
      removeUpdateListeners: () => void;
      showNotification:      (opts: { title: string; body: string }) => void;
    };
  }
}

type Phase = 'idle' | 'available' | 'downloading' | 'downloaded';

function fmtMB(bytes: number): string {
  if (bytes <= 0) return '0 MB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtSpeed(bps: number): string {
  if (bps <= 0) return '';
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function UpdateNotification() {
  const { t } = useTranslation();
  const [phase,    setPhase]    = useState<Phase>('idle');
  const [version,  setVersion]  = useState('');
  const [progress, setProgress] = useState(0);
  const [dlDetails, setDlDetails] = useState<{ transferred: number; total: number; bps: number } | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable((info) => {
      setVersion(info.version);
      setPhase('available');
    });

    window.electronAPI.onUpdateProgress((p) => {
      setProgress(Math.round(p.percent));
      setDlDetails({ transferred: p.transferred, total: p.total, bps: p.bytesPerSecond });
      setPhase('downloading');
    });

    window.electronAPI.onUpdateDownloaded(() => {
      setPhase('downloaded');
    });

    return () => {
      window.electronAPI?.removeUpdateListeners();
    };
  }, []);

  if (phase === 'idle') return null;

  const handleDownload = () => {
    setPhase('downloading');
    window.electronAPI?.downloadUpdate();
  };

  return (
    <div className="update-overlay">
      <div className="update-modal" role="dialog" aria-modal="true">
        {/* Icon */}
        <div className="update-modal-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>

        {/* Title */}
        <h2 className="update-modal-title">{t('update.available')}</h2>
        <p className="update-modal-version">{t('update.version', { version })}</p>
        <p className="update-modal-mandatory">{t('update.mandatory')}</p>

        {/* Progress bar – visible while downloading */}
        {(phase === 'downloading' || phase === 'downloaded') && (
          <>
            <div className="update-progress-wrap">
              <div
                className="update-progress-bar"
                style={{ width: phase === 'downloaded' ? '100%' : `${progress}%` }}
              />
            </div>
            <div className="update-progress-details">
              {phase === 'downloaded' ? (
                <span className="update-progress-label">{t('update.readyToInstall')}</span>
              ) : (
                <>
                  <span className="update-progress-pct">{progress}%</span>
                  {dlDetails && dlDetails.total > 0 && (
                    <span className="update-progress-size">
                      {fmtMB(dlDetails.transferred)}&nbsp;/&nbsp;{fmtMB(dlDetails.total)}
                    </span>
                  )}
                  {dlDetails && dlDetails.bps > 0 && (
                    <span className="update-progress-speed">{fmtSpeed(dlDetails.bps)}</span>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Action button */}
        {phase === 'available' && (
          <button className="update-btn" onClick={handleDownload}>
            {t('update.download')}
          </button>
        )}
        {phase === 'downloading' && (
          <button className="update-btn update-btn--loading" disabled>
            {t('update.downloading')}
          </button>
        )}
        {phase === 'downloaded' && (
          <button className="update-btn update-btn--ready" disabled>
            {t('update.restart')}
          </button>
        )}
      </div>
    </div>
  );
}
