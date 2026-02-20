import { useEffect, useState } from 'react';
import './LoadingScreen.css';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev === '...') return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loading-screen">
      <div className="loading-content">
        <div className="loading-icon-wrapper">
          <img src="/logo.png" alt="DMXGram Logo" className="loading-icon" />
          <div className="loading-pulse"></div>
        </div>
        <h2 className="loading-title">DMXGram</h2>
        <p className="loading-message">{message}{dots}</p>
        <div className="loading-bar">
          <div className="loading-bar-fill"></div>
        </div>
      </div>
    </div>
  );
}
