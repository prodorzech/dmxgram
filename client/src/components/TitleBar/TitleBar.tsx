import { useState, useEffect, useCallback } from 'react';
import './TitleBar.css';

export function TitleBar() {
  const [maximized, setMaximized] = useState(true);

  useEffect(() => {
    // Set CSS variable for titlebar height
    document.documentElement.style.setProperty('--titlebar-height', '32px');

    // Get initial state
    window.electronAPI?.isMaximized?.().then(setMaximized);

    // Listen for maximize/unmaximize events
    window.electronAPI?.onMaximizedChange?.((val) => setMaximized(val));
  }, []);

  const handleMinimize = useCallback(() => {
    window.electronAPI?.windowMinimize?.();
  }, []);

  const handleMaximize = useCallback(() => {
    window.electronAPI?.windowMaximize?.();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.windowClose?.();
  }, []);

  // Don't render titlebar if not in Electron
  if (!window.electronAPI) return null;

  return (
    <div className="titlebar">
      <div className="titlebar-title">
        <img src="/logo.png" className="titlebar-icon" alt="" />
        <span className="titlebar-text">DMXGram</span>
      </div>

      <div className="titlebar-controls">
        {/* Minimize */}
        <button className="titlebar-btn" onClick={handleMinimize} aria-label="Minimize">
          <svg viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>

        {/* Maximize / Restore */}
        <button className="titlebar-btn" onClick={handleMaximize} aria-label={maximized ? 'Restore' : 'Maximize'}>
          {maximized ? (
            // Restore icon (two overlapping squares)
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="2" y="3" width="7" height="7" rx="0.5" />
              <polyline points="3,3 3,1 9,1 9,7 8,7" />
            </svg>
          ) : (
            // Maximize icon (single square)
            <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
            </svg>
          )}
        </button>

        {/* Close */}
        <button className="titlebar-btn close" onClick={handleClose} aria-label="Close">
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
