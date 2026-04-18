import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ── Apply saved theme BEFORE React paints (prevents flash) ────────────────────
const savedMode = localStorage.getItem('ros_theme') || 'light';
const LIGHT_BG  = '#F4F7FB';
const DARK_BG   = '#020617';
document.body.style.background = savedMode === 'light' ? LIGHT_BG : DARK_BG;
document.body.style.margin     = '0';

// Global base styles
const style = document.createElement('style');
style.innerHTML = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; transition: background 0.3s, color 0.3s; }
  button, input, select, textarea { font-family: 'Inter', sans-serif; letter-spacing: 0; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  select option { background: var(--card); color: var(--text); }
`;
document.head.appendChild(style);

// Google Fonts
const link    = document.createElement('link');
link.href     = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap';
link.rel      = 'stylesheet';
document.head.appendChild(link);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
