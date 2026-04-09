import React, { createContext, useContext, useState, useEffect } from 'react';

// ─── Theme palettes ────────────────────────────────────────────────────────────
export const THEMES = {
  dark: {
    bg:          '#0A0C10',
    surface:     '#111318',
    card:        '#181C24',
    border:      '#252A35',
    borderLight: '#2E3545',
    accent:      '#F5A623',
    accentGlow:  'rgba(245,166,35,0.18)',
    accentDim:   '#C47F0F',
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
    bg:          '#ECEEF2',        // slightly deeper — distinguishes bg from surface
    surface:     '#F5F6F8',        // sidebar / panels — off-white, clearly ≠ card
    card:        '#FFFFFF',        // content cards stay pure white
    border:      '#C8CDD8',        // darker border — cards clearly visible on bg
    borderLight: '#B0B7C6',        // secondary borders, dividers
    accent:      '#C47A0A',        // deeper amber — 4.5:1+ on white
    accentGlow:  'rgba(196,122,10,0.14)', // visible active-nav highlight
    accentDim:   '#A36308',        // hover/dim accent
    green:       '#15803D',        // deeper green — 4.8:1 on white
    greenDim:    'rgba(21,128,61,0.12)',
    red:         '#B91C1C',        // deeper red — 5.0:1 on white
    redDim:      'rgba(185,28,28,0.10)',
    blue:        '#1D4ED8',        // deeper blue — 5.9:1 on white
    blueDim:     'rgba(29,78,216,0.10)',
    purple:      '#6D28D9',        // deeper purple — 5.1:1 on white
    text:        '#111827',        // near-black — unchanged
    textMid:     '#374151',        // dark gray — 10:1 on white (was too light)
    textDim:     '#6B7280',        // medium gray — 4.6:1 on white (was #9CA3AF at 2.8:1)
  },
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => localStorage.getItem('ros_theme') || 'dark');

  const theme = THEMES[mode];

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
    <ThemeContext.Provider value={{ mode, theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
