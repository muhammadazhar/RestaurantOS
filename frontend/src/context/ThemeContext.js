import React, { createContext, useContext, useState, useEffect } from 'react';

// ─── Theme palettes ────────────────────────────────────────────────────────────
export const THEMES = {
  dark: {
    bg:          '#020617',
    surface:     '#111827',
    card:        '#0F172A',
    border:      'rgba(255,255,255,0.10)',
    borderLight: 'rgba(255,255,255,0.16)',
    accent:      '#FBBF24',
    accentGlow:  'rgba(251,191,36,0.12)',
    accentDim:   '#F59E0B',
    green:       '#10B981',
    greenDim:    'rgba(16,185,129,0.15)',
    red:         '#EF4444',
    redDim:      'rgba(239,68,68,0.14)',
    blue:        '#38BDF8',
    blueDim:     'rgba(56,189,248,0.14)',
    purple:      '#9B59B6',
    text:        '#FFFFFF',
    textMid:     '#CBD5E1',
    textDim:     '#94A3B8',
  },
  ocean: {
    bg:          '#070D17',
    surface:     '#0D1520',
    card:        '#111E2D',
    border:      '#1A2A3D',
    borderLight: '#243750',
    accent:      '#3498DB',
    accentGlow:  'rgba(52,152,219,0.18)',
    accentDim:   '#2475B0',
    green:       '#2ECC71',
    greenDim:    'rgba(46,204,113,0.15)',
    red:         '#E74C3C',
    redDim:      'rgba(231,76,60,0.15)',
    blue:        '#3498DB',
    blueDim:     'rgba(52,152,219,0.15)',
    purple:      '#9B59B6',
    text:        '#E8ECF4',
    textMid:     '#8A94A8',
    textDim:     '#4A5568',
  },
  purple: {
    bg:          '#0C0910',
    surface:     '#130F1A',
    card:        '#1A1525',
    border:      '#28203A',
    borderLight: '#352A4D',
    accent:      '#9B59B6',
    accentGlow:  'rgba(155,89,182,0.18)',
    accentDim:   '#7D3C98',
    green:       '#2ECC71',
    greenDim:    'rgba(46,204,113,0.15)',
    red:         '#E74C3C',
    redDim:      'rgba(231,76,60,0.15)',
    blue:        '#3498DB',
    blueDim:     'rgba(52,152,219,0.15)',
    purple:      '#9B59B6',
    text:        '#E8ECF4',
    textMid:     '#8A94A8',
    textDim:     '#4A5568',
  },
  emerald: {
    bg:          '#071210',
    surface:     '#0D1B19',
    card:        '#112420',
    border:      '#1A3330',
    borderLight: '#234540',
    accent:      '#2ECC71',
    accentGlow:  'rgba(46,204,113,0.18)',
    accentDim:   '#1E8449',
    green:       '#2ECC71',
    greenDim:    'rgba(46,204,113,0.15)',
    red:         '#E74C3C',
    redDim:      'rgba(231,76,60,0.15)',
    blue:        '#3498DB',
    blueDim:     'rgba(52,152,219,0.15)',
    purple:      '#9B59B6',
    text:        '#E8ECF4',
    textMid:     '#8A94A8',
    textDim:     '#4A5568',
  },
  light: {
    bg:          '#F4F7FB',
    surface:     '#F8FAFC',
    card:        '#FFFFFF',
    border:      '#E2E8F0',
    borderLight: '#CBD5E1',
    accent:      '#14B8A6',
    accentGlow:  '#F0FDFA',
    accentDim:   '#0D9488',
    green:       '#15803D',
    greenDim:    'rgba(21,128,61,0.12)',
    red:         '#B91C1C',
    redDim:      'rgba(185,28,28,0.10)',
    blue:        '#0D9488',
    blueDim:     '#CCFBF1',
    purple:      '#6D28D9',
    text:        '#0F172A',
    textMid:     '#475569',
    textDim:     '#64748B',
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem('ros_theme');
    return (saved && THEMES[saved]) ? saved : 'light';
  });

  const theme = THEMES[mode] || THEMES.dark;

  // Inject CSS variables onto :root whenever mode changes
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, val]) => {
      // Convert camelCase to --kebab-case
      const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
      root.style.setProperty(cssVar, val);
    });
    // Also set body background directly so there's no flash
    document.body.style.background = theme.bg;
    document.body.style.color      = theme.text;
    localStorage.setItem('ros_theme', mode);
  }, [mode, theme]);

  const toggle = () => setMode(m => m === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ mode, theme, toggle, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
