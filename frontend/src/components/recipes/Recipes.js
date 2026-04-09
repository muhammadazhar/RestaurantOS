import React, { useEffect, useState } from 'react';
import { getRecipes, createRecipe } from '../../services/api';
import { Card, Spinner, Btn, Modal, Input, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

export default function Recipes() {
  useT();
  const [recipes, setRecipes]   = useState([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [form, setForm]         = useState({ name: '', prep_time_min: 10, cook_time_min: 20, serves: 1, instructions: '', notes: '' });

  const load = () => getRecipes().then(r => { setRecipes(r.data); if (r.data.length) setSelected(0); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name) return toast.error('Name required');
    try {
      await createRecipe(form);
      toast.success('Recipe saved!');
      setModal(false); load();
    } catch { toast.error('Failed'); }
  };

  if (loading) return <Spinner />;

  const recipe = recipes[selected];

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ width: 260 }}>
        <PageHeader title="📋 Recipes" action={<Btn onClick={() => setModal(true)} size="sm">+ New</Btn>} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recipes.map((r, i) => (
            <div key={r.id} onClick={() => setSelected(i)} style={{
              padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
              background: selected === i ? T.accentGlow : T.card,
              border: `1px solid ${selected === i ? T.accent + '66' : T.border}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{r.name}</div>
              <div style={{ fontSize: 11, color: T.textMid, marginTop: 3 }}>
                {r.menu_item_name || 'Standalone'} · Serves {r.serves}
              </div>
              <div style={{ fontSize: 11, color: T.accent, marginTop: 2, fontFamily: 'monospace' }}>
                Prep {r.prep_time_min}min · Cook {r.cook_time_min}min
              </div>
            </div>
          ))}
          {recipes.length === 0 && <div style={{ color: T.textDim, fontSize: 13, textAlign: 'center', padding: 24 }}>No recipes yet</div>}
        </div>
      </div>

      <div style={{ flex: 1 }}>
        {recipe ? (
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20, alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: 0 }}>{recipe.name}</h2>
                <div style={{ fontSize: 13, color: T.textMid, marginTop: 6 }}>
                  Prep: {recipe.prep_time_min}min · Cook: {recipe.cook_time_min}min · Serves: {recipe.serves}
                </div>
              </div>
              {recipe.selling_price && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: T.textMid }}>Selling Price</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: T.accent, fontFamily: 'monospace' }}>PKR {recipe.selling_price}</div>
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Ingredients</div>
                {(recipe.ingredients || []).map((ing, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: 13, color: T.text }}>{ing.name}</span>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, color: T.accent, fontWeight: 700 }}>{ing.quantity} {ing.unit}</span>
                  </div>
                ))}
                {(!recipe.ingredients || recipe.ingredients.length === 0) && (
                  <div style={{ color: T.textDim, fontSize: 13 }}>No ingredients listed</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Instructions</div>
                {(recipe.instructions || '').split('\n').filter(Boolean).map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.accent, color: '#000', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                    <p style={{ fontSize: 13, lineHeight: 1.6, color: T.textMid, margin: 0 }}>{step.replace(/^\d+\.\s*/, '')}</p>
                  </div>
                ))}
                {!recipe.instructions && <div style={{ color: T.textDim, fontSize: 13 }}>No instructions</div>}
                {recipe.notes && (
                  <div style={{ marginTop: 16, padding: '10px 14px', background: T.accentGlow, borderRadius: 10, fontSize: 12, color: T.textMid }}>
                    📝 {recipe.notes}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ) : (
          <div style={{ textAlign: 'center', padding: 80, color: T.textDim }}>
            <div style={{ fontSize: 48 }}>📋</div>
            <div style={{ marginTop: 12 }}>Select a recipe or create one</div>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Recipe">
        <Input label="Recipe Name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Beef Ribeye 250g" />
        <div style={{ display: 'flex', gap: 10 }}>
          <Input label="Prep (min)" type="number" value={form.prep_time_min} onChange={e => setForm(f => ({ ...f, prep_time_min: e.target.value }))} />
          <Input label="Cook (min)" type="number" value={form.cook_time_min} onChange={e => setForm(f => ({ ...f, cook_time_min: e.target.value }))} />
          <Input label="Serves" type="number" value={form.serves} onChange={e => setForm(f => ({ ...f, serves: e.target.value }))} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: T.textMid, fontWeight: 600, marginBottom: 6 }}>Instructions</div>
          <textarea value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
            placeholder="1. Step one&#10;2. Step two"
            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, width: '100%', minHeight: 120, resize: 'vertical', fontFamily: "'Syne', sans-serif", outline: 'none' }} />
        </div>
        <Input label="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Tips, variations..." />
        <Btn onClick={handleCreate} style={{ width: '100%', marginTop: 8 }}>Save Recipe</Btn>
      </Modal>
    </div>
  );
}
