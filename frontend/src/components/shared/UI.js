import React, { useState, useContext, createContext } from 'react';
import { useTheme } from '../../context/ThemeContext';

// ── T: live theme token object ─────────────────────────────────────────────────
// Every component that imports T gets the current theme on every render.
// T is a Proxy-like getter — call useT() in components, or use the T export
// for non-hook contexts (styles passed as objects).
// In practice: import { T } from '../shared/UI' still works because T is
// re-evaluated each render when used inside a component's render body.

// Static fallback (dark) used at module-init time before React mounts
import { THEMES } from '../../context/ThemeContext';
let _theme = THEMES.dark;

export function useT() {
  const { theme } = useTheme();
  _theme = theme;
  return theme;
}

// T proxy — works as a plain object in JSX style expressions.
// Components must call useT() at the top to hydrate it, OR be rendered
// inside a component that already did so (parent re-renders cascade).
export const T = new Proxy({}, {
  get(_, key) { return _theme[key]; },
});

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitive UI components
// Each one calls useT() so _theme stays current.
// ─────────────────────────────────────────────────────────────────────────────

export const Badge = ({ color, children, small, style }) => {
  useT();
  const bg = color === T.green ? T.greenDim
           : color === T.red   ? T.redDim
           : color === T.blue  ? T.blueDim
           : T.accentGlow;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      background: bg, color: color || T.accent, borderRadius: 20,
      padding: small ? '2px 8px' : '4px 10px',
      fontSize: small ? 10 : 11, fontWeight: 700, letterSpacing: 0.5,
      textTransform: 'uppercase', ...style,
    }}>{children}</span>
  );
};

export const Card = ({ children, style, onClick, hover }) => {
  useT();
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => hover && setHov(true)}
      onMouseLeave={() => hover && setHov(false)}
      style={{
        background: T.card,
        border: `1px solid ${hov ? T.borderLight : T.border}`,
        borderRadius: 16, padding: 20, transition: 'all 0.2s',
        transform: hov ? 'translateY(-2px)' : 'none',
        boxShadow: hov ? '0 8px 32px rgba(0,0,0,0.15)' : 'none',
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >{children}</div>
  );
};

export const StatCard = ({ label, value, sub, color, icon }) => {
  useT();
  return (
    <Card hover style={{ flex: 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: color || T.accent, fontFamily: 'monospace' }}>{value}</div>
          {sub && <div style={{ fontSize: 12, color: T.textMid, marginTop: 6 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 26, opacity: 0.25 }}>{icon}</div>
      </div>
    </Card>
  );
};

export const Pill = ({ active, onClick, children }) => {
  useT();
  return (
    <button onClick={onClick} style={{
      background: active ? T.accent : 'transparent',
      color: active ? '#000' : T.textMid,
      border: `1px solid ${active ? T.accent : T.border}`,
      borderRadius: 24, padding: '6px 16px', fontSize: 13, fontWeight: 600,
      cursor: 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
    }}>{children}</button>
  );
};

export const Input = ({ label, ...props }) => {
  useT();
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600, letterSpacing: 0.3 }}>{label}</div>}
      <input {...props} style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13,
        width: '100%', outline: 'none', fontFamily: "'Inter', sans-serif",
        transition: 'border-color 0.2s',
        ...props.style,
      }} />
    </div>
  );
};

export const Select = ({ label, children, ...props }) => {
  useT();
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600, letterSpacing: 0.3 }}>{label}</div>}
      <select {...props} style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13,
        width: '100%', outline: 'none', fontFamily: "'Inter', sans-serif",
        ...props.style,
      }}>{children}</select>
    </div>
  );
};

export const Btn = ({ children, variant = 'primary', size = 'md', style, ...props }) => {
  useT();
  const bg    = variant === 'primary' ? T.accent
              : variant === 'danger'  ? T.red
              : variant === 'ghost'   ? 'transparent'
              : T.card;
  const color = variant === 'primary' ? '#000'
              : variant === 'danger'  ? '#fff'
              : T.text;
  const pad   = size === 'sm' ? '6px 12px' : size === 'lg' ? '14px 24px' : '10px 18px';
  return (
    <button {...props} style={{
      background: bg, color,
      border: `1px solid ${variant === 'ghost' ? T.border : 'transparent'}`,
      borderRadius: 10, padding: pad,
      fontSize: size === 'sm' ? 12 : 13,
      fontWeight: 700, cursor: 'pointer',
      fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
      ...style,
    }}>{children}</button>
  );
};

export const Spinner = () => {
  useT();
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${T.border}`, borderTop: `3px solid ${T.accent}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export const Empty = ({ message = 'No data', icon = '📭' }) => {
  useT();
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{message}</div>
    </div>
  );
};

export const PageHeader = ({ title, subtitle, action }) => {
  useT();
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: T.textMid }}>{subtitle}</div>}
      </div>
      {action}
    </div>
  );
};

export const Table = ({ columns, rows, keyField = 'id' }) => {
  useT();
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: T.surface }}>
            {columns.map(c => (
              <th key={c.key} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row[keyField]} style={{ borderTop: `1px solid ${T.border}` }}>
              {columns.map(c => (
                <td key={c.key} style={{ padding: '12px 16px', fontSize: 13, verticalAlign: 'middle', ...c.style }}>
                  {c.render ? c.render(row) : row[c.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

export const Modal = ({ open, onClose, title, children, width = 480 }) => {
  useT();
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'relative', background: T.card,
        border: `1px solid ${T.border}`, borderRadius: 20,
        padding: 28, width, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ color: T.text, fontSize: 18, fontWeight: 800, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
};
