import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { UIProvider } from './context/UIContext';
import './i18n';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  document.body.innerHTML = '<div style="color:red;padding:2rem">FATAL: #root element not found</div>';
} else {
  try {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <UIProvider>
          <App />
        </UIProvider>
      </React.StrictMode>
    );
  } catch (err: any) {
    rootEl.innerHTML = `<div style="position:fixed;inset:0;background:#0f0f0f;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;padding:2rem;text-align:center">
      <h2 style="color:#dc2626;margin-bottom:1rem">DMXGram – błąd startu</h2>
      <pre style="background:#1a1a1a;padding:1rem;border-radius:8px;color:#f87171;max-width:90%;overflow:auto;font-size:0.75rem;text-align:left">${String(err?.stack || err)}</pre>
      <button onclick="location.reload()" style="margin-top:1.5rem;padding:0.6rem 1.5rem;background:#dc2626;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem">Odśwież</button>
    </div>`;
  }
}
