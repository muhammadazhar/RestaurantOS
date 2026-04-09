import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// ── Apply saved theme BEFORE React paints (prevents flash) ────────────────────
const savedMode = localStorage.getItem('ros_theme') || 'dark';
const LIGHT_BG  = '#ECEEF2';
const DARK_BG   = '#0A0C10';
document.body.style.background = savedMode === 'light' ? LIGHT_BG : DARK_BG;
document.body.style.margin     = '0';

// Global base styles
const style = document.createElement('style');
style.innerHTML = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Syne', sans-serif; transition: background 0.3s, color 0.3s; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  select option { background: var(--card); color: var(--text); }
`;
document.head.appendChild(style);

// Google Fonts
const link    = document.createElement('link');
link.href     = 'https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&display=swap';
link.rel      = 'stylesheet';
document.head.appendChild(link);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><App /></React.StrictMode>);
