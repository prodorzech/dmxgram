import { useState, useEffect } from 'react';
import './UpdateNotification.css';

interface UpdateInfo {
  version: string;
  releaseDate?: string;
}

declare global {
  interface Window {
    electronAPI?: {
      onUpdateAvailable:     (cb: (info: UpdateInfo) => void) => void;
      onUpdateProgress:      (cb: (p: any) => void) => void;
      onUpdateDownloaded:    (cb: (info: any) => void) => void;
      downloadUpdate:        () => void;
      removeUpdateListeners: () => void;
    };
  }
}

export function UpdateNotification() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [clicked,    setClicked]    = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable((info) => {
      setUpdateInfo(info);
    });

    return () => {
      window.electronAPI?.removeUpdateListeners();
    };
  }, []);

  if (!updateInfo || clicked) return null;

  const handleClick = () => {
    setClicked(true);
    window.electronAPI?.downloadUpdate();
  };

  return (
    <button className="update-notification" onClick={handleClick} title={`Aktualizuj do wersji ${updateInfo.version}`}>
      <svg className="update-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span className="update-text">
        Aktualizacja dostępna <strong>v{updateInfo.version}</strong>
      </span>
      <span className="update-pill">NOWA</span>
    </button>
  );
}
