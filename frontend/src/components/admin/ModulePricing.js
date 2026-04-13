import React, { useEffect, useState, useCallback } from 'react';
import { getModulePricing, saveModulePricing } from '../../services/api';
import { Card, Btn, Spinner, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const PLAN_TYPES = [
  { key: 'trial',       label: 'Free Trial',   color: '#f39c12' },
  { key: 'monthly',     label: 'Monthly',      color: '#3498db' },
  { key: 'quarterly',   label: 'Quarterly',    color: '#9b59b6' },
  { key: 'half_yearly', label: 'Half Yearly',  color: '#2ecc71' },
  { key: 'yearly',      label: 'Yearly',       color: '#e67e22' },
];

const MODULE_ICONS = {
  base: '🍽', tables: '🪑', inventory: '📦', staff: '👥',
  rider: '🛵', gl: '📒', reports: '📊',
};

export default function ModulePricing() {
  useT();
  const [data,    setData]    = useState(null);
  const [edited,  setEdited]  = useState({});  // "moduleKey|planType" → {price, duration_days, is_active}
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getModulePricing();
      setData(res.data);
      const e = {};
      for (const p of res.data.pricing) {
        e[`${p.module_key}|${p.plan_type}`] = {
          price: p.price, duration_days: p.duration_days, is_active: p.is_active,
        };
      }
      setEdited(e);
    } catch { toast.error('Failed to load module pricing'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (module_key, plan_type, field, val) => {
    const k = `${module_key}|${plan_type}`;
    setEdited(p => ({ ...p, [k]: { ...(p[k] || {}), [field]: val } }));
  };

  const get = (module_key, plan_type, field, def) => {
    const k = `${module_key}|${plan_type}`;
    return edited[k]?.[field] ?? def;
  };

  const save = async () => {
    setSaving(true);
    try {
      const pricing = [];
      for (const [k, v] of Object.entries(edited)) {
        const [module_key, plan_type] = k.split('|');
        pricing.push({ module_key, plan_type, ...v });
      }
      await saveModulePricing({ pricing });
      toast.success('Module pricing saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  if (!data) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="💰 Module Pricing"
        subtitle="Configure subscription plans and pricing for each module"
        action={<Btn onClick={save} disabled={saving}>{saving ? '⏳ Saving…' : '✓ Save All Pricing'}</Btn>}
      />

      <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 12, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: T.textMid }}>
        <strong style={{ color: T.text }}>Note:</strong> Free Trial is automatically activated. All paid plans require super admin payment confirmation before activation.
        Set price to 0 to make a plan free. Uncheck "Active" to hide a plan from customers.
      </div>

      {data.modules.map(mod => (
        <div key={mod.key} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 22 }}>{MODULE_ICONS[mod.key]}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{mod.name}</div>
              <div style={{ fontSize: 12, color: T.textMid }}>{mod.description}</div>
            </div>
          </div>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>Plan</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>Price (PKR)</th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>Duration (days)</th>
                  <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {PLAN_TYPES.map((pt, i) => (
                  <tr key={pt.key} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: pt.color,
                        background: pt.color + '20', padding: '3px 8px', borderRadius: 6 }}>
                        {pt.label}
                      </span>
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <input
                        type="number"
                        min={0}
                        value={get(mod.key, pt.key, 'price', 0)}
                        onChange={e => set(mod.key, pt.key, 'price', parseFloat(e.target.value) || 0)}
                        disabled={pt.key === 'trial'}
                        style={{
                          width: 110, padding: '6px 10px', borderRadius: 8,
                          border: `1px solid ${T.border}`, background: pt.key === 'trial' ? T.surface : T.card,
                          color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif",
                          outline: 'none',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px 16px' }}>
                      <input
                        type="number"
                        min={1}
                        value={get(mod.key, pt.key, 'duration_days', 30)}
                        onChange={e => set(mod.key, pt.key, 'duration_days', parseInt(e.target.value) || 30)}
                        style={{
                          width: 90, padding: '6px 10px', borderRadius: 8,
                          border: `1px solid ${T.border}`, background: T.card,
                          color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif",
                          outline: 'none',
                        }}
                      />
                    </td>
                    <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={get(mod.key, pt.key, 'is_active', true)}
                        onChange={e => set(mod.key, pt.key, 'is_active', e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}
    </div>
  );
}
