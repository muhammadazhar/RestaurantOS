import React from 'react';
import {
  getMenu, createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuItemImage,
  getCategories, createCategory, updateCategory, deleteCategory,
  updateRestaurantSettings,
} from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5001');

const PRICING_MODES = [
  { key: 'variant', label: 'Portion / Variant', helper: 'Half, full, family' },
  { key: 'weight', label: 'Weight Based', helper: '250g, 500g, 1kg' },
  { key: 'piece', label: 'Piece Based', helper: '1 pc, 2 pcs, 4 pcs' },
  { key: 'pack', label: 'Quantity / Pack', helper: 'Single, pack, carton' },
];

const WEEKDAY_OPTIONS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const VARIANT_TEMPLATES = {
  variant: [
    { name: 'Quarter', value_label: '1-2 Persons', price: 700, cost: 520, is_default: true },
    { name: 'Half', value_label: '2-3 Persons', price: 1200, cost: 850 },
    { name: 'Full', value_label: '4-5 Persons', price: 2300, cost: 1650 },
  ],
  weight: [
    { name: 'Quarter KG', value_label: '0.25 KG', price: 450, cost: 320, is_default: true },
    { name: 'Half KG', value_label: '0.50 KG', price: 900, cost: 640 },
    { name: '1 KG', value_label: '1.00 KG', price: 1800, cost: 1250 },
  ],
  piece: [
    { name: '1 pc', value_label: '1', price: 320, cost: 220, is_default: true },
    { name: '2 pcs', value_label: '2', price: 640, cost: 440 },
    { name: '4 pcs', value_label: '4', price: 1280, cost: 880 },
  ],
  pack: [
    { name: 'Single', value_label: '1', price: 80, cost: 52, is_default: true },
    { name: 'Pack of 6', value_label: '6', price: 450, cost: 290 },
    { name: 'Carton of 12', value_label: '12', price: 850, cost: 560 },
  ],
};

const BLANK_VARIANT = { name: '', value_label: '', price: '', cost: '', is_default: false };
const BLANK_ADDON_GROUP = {
  name: 'Extra Sides',
  min_select: 0,
  max_select: 3,
  addons: [
    { name: 'Raita', price: 50, cost: 30, is_active: true },
    { name: 'Salad', price: 40, cost: 25, is_active: true },
    { name: 'Extra Naan', price: 30, cost: 20, is_active: true },
  ],
};
const BLANK_ITEM = {
  name: '', description: '', category_id: '', cost: '', prep_time_min: 10,
  status: 'active', image_url: '', is_popular: false,
  sort_order: 0,
  pricing_mode: 'variant', kitchen_route: 'Main Kitchen',
  tax_included: true, tax_applicable: false, discount_eligible: true,
  visible_pos: true, visible_web: true, visible_delivery: true,
  min_qty: 1, max_qty: 10, step_qty: 1,
  round_off_rule: 'nearest_0_50', service_charge_percent: 10,
  price_override_role: 'manager_only', allow_open_price: false, hide_cost_on_pos: true,
  open_price_role: 'manager',
  combo_eligible: true, weekend_price_rule: false, weekend_price: '', weekend_days: ['FRI', 'SAT'], promotion_label: 'Chef Special',
  variants: VARIANT_TEMPLATES.variant.map(v => ({ ...v })),
  addon_groups: [{ ...BLANK_ADDON_GROUP, addons: BLANK_ADDON_GROUP.addons.map(a => ({ ...a })) }],
};
const BLANK_CAT = { name: '', description: '', parent_id: '', sort_order: 0, is_active: true };

const money = (value) => `PKR ${Number(value || 0).toLocaleString()}`;
const imageUrl = (src) => src ? (src.startsWith('http') ? src : `${IMG_BASE}${src}`) : null;
const activeVariants = (item) => (item.variants?.length ? item.variants : [{ name: 'Regular', price: item.price }]).filter(v => v.is_active !== false);
const defaultVariant = (item) => activeVariants(item).find(v => v.is_default) || activeVariants(item)[0] || { name: 'Regular', price: item.price || 0 };
const cloneAddonGroups = (groups) => groups.map(group => ({ ...group, addons: (group.addons || []).map(addon => ({ ...addon })) }));

const LIGHT_V3 = {
  page: '#f4f7fb',
  white: '#ffffff',
  slate900: '#0f172a',
  slate800: '#1e293b',
  slate700: '#334155',
  slate600: '#475569',
  slate500: '#64748b',
  slate300: '#cbd5e1',
  slate200: '#e2e8f0',
  slate100: '#f1f5f9',
  slate50: '#f8fafc',
  teal600: '#0d9488',
  teal500: '#14b8a6',
  teal100: '#ccfbf1',
  teal50: '#f0fdfa',
};

const makeMenuColors = (theme, light) => light ? LIGHT_V3 : {
  page: theme.bg,
  white: theme.card,
  slate900: theme.text,
  slate800: theme.textMid,
  slate700: theme.textMid,
  slate600: theme.textMid,
  slate500: theme.textDim,
  slate300: theme.borderLight,
  slate200: theme.border,
  slate100: theme.surface,
  slate50: theme.surface,
  teal600: theme.accentDim,
  teal500: theme.accent,
  teal100: theme.accentGlow,
  teal50: theme.accentGlow,
};

function Field({ label, children, labelColor = '#94a3b8' }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: labelColor, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function Modal({ title, children, onClose, width = 560 }) {
  const { mode, theme } = useTheme();
  const light = mode === 'light';
  const C = makeMenuColors(theme, light);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center', padding: 18 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,23,0.78)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', width: '100%', maxWidth: width, maxHeight: '92vh', overflow: 'auto', borderRadius: 24, background: C.page, border: `1px solid ${C.slate200}`, boxShadow: light ? '0 28px 70px rgba(15,23,42,0.18)' : '0 28px 70px rgba(0,0,0,0.55)', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, color: C.slate900, fontSize: 18 }}>{title}</h2>
          <button onClick={onClose} style={{ background: C.white, border: `1px solid ${C.slate200}`, borderRadius: 12, color: C.slate500, fontSize: 20, cursor: 'pointer', width: 34, height: 34 }}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function IconButton({ title, icon, onClick, tone = 'neutral', style }) {
  const colors = tone === 'danger'
    ? { border: '#fecaca', bg: '#fff1f2', color: '#dc2626' }
    : { border: '#cbd5e1', bg: '#ffffff', color: '#334155' };
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        border: `1px solid ${colors.border}`,
        background: colors.bg,
        color: colors.color,
        cursor: 'pointer',
        display: 'inline-grid',
        placeItems: 'center',
        fontSize: 15,
        lineHeight: 1,
        ...style,
      }}
    >
      {icon}
    </button>
  );
}

export default function MenuManagementV2() {
  const { mode, theme } = useTheme();
  const light = mode === 'light';
  const C = React.useMemo(() => makeMenuColors(theme, light), [theme, light]);
  const T = {
    text: C.slate900,
    textMid: C.slate600,
    textDim: C.slate500,
  };
  const [menu, setMenu] = React.useState({ categories: [], items: [] });
  const [allCategories, setAllCategories] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [activeCategory, setActiveCategory] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [itemModal, setItemModal] = React.useState(null);
  const [catModal, setCatModal] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [smartSortEnabled, setSmartSortEnabled] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [menuRes, catsRes] = await Promise.all([getMenu({ includeInactive: true }), getCategories()]);
      setMenu(menuRes.data);
      setAllCategories(catsRes.data);
      setSmartSortEnabled(menuRes.data?.settings?.pos_smart_menu_sort_enabled === true);
    } catch {
      toast.error('Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const categories = menu.categories || [];
  const items = menu.items || [];
  const categoryCounts = items.reduce((acc, item) => {
    acc[item.category_id || 'uncategorized'] = (acc[item.category_id || 'uncategorized'] || 0) + 1;
    return acc;
  }, {});
  const variantCount = items.reduce((sum, item) => sum + activeVariants(item).length, 0);
  const addonCount = items.reduce((sum, item) => sum + (item.addon_groups || []).reduce((count, group) => count + (group.addons?.length || 0), 0), 0);

  const filteredItems = items.filter(item => {
    const catOk = activeCategory === 'all' || item.category_id === activeCategory;
    const q = search.trim().toLowerCase();
    const searchOk = !q || [item.name, item.description, item.category_name, item.kitchen_route].filter(Boolean).some(v => v.toLowerCase().includes(q));
    return catOk && searchOk;
  });

  const S = {
    colors: C,
    page: { color: C.slate900, fontFamily: "'Inter', sans-serif", background: C.page, padding: 24, minHeight: '100vh' },
    hero: {
      borderRadius: 32,
      border: `1px solid ${C.slate200}`,
      background: C.white,
      padding: 24,
      marginBottom: 22,
      boxShadow: light ? '0 1px 3px rgba(15,23,42,0.08)' : '0 18px 42px rgba(0,0,0,0.22)',
    },
    panel: {
      background: C.white,
      border: `1px solid ${C.slate200}`,
      boxShadow: light ? '0 1px 3px rgba(15,23,42,0.08)' : '0 18px 42px rgba(0,0,0,0.18)',
    },
    active: {
      background: C.teal50,
      border: `1px solid ${C.teal500}`,
      color: light ? C.slate900 : C.teal500,
    },
    inactive: {
      background: C.white,
      border: `1px solid ${C.slate200}`,
      color: C.slate700,
    },
    card: {
      background: C.white,
      border: `1px solid ${C.slate200}`,
      boxShadow: light ? '0 1px 3px rgba(15,23,42,0.08)' : '0 18px 42px rgba(0,0,0,0.18)',
    },
    image: { background: C.slate100 },
    soft: {
      background: C.slate50,
      border: `1px solid ${C.slate200}`,
    },
    primary: {
      background: C.teal500,
      color: light ? '#fff' : '#020617',
    },
    secondary: {
      background: C.white,
      color: C.slate700,
      border: `1px solid ${C.slate300}`,
    },
  };

  const inputStyle = {
    width: '100%', borderRadius: 16, border: `1px solid ${C.slate200}`,
    background: C.slate50, color: C.slate900, padding: '12px 14px', outline: 'none',
    fontSize: 14, fontFamily: "'Inter', sans-serif", boxSizing: 'border-box',
  };

  const openNewItem = () => setItemModal({
    mode: 'new',
    form: {
      ...BLANK_ITEM,
      variants: VARIANT_TEMPLATES.variant.map(v => ({ ...v })),
      addon_groups: cloneAddonGroups(BLANK_ITEM.addon_groups),
    },
    pendingFile: null,
  });
  const openEditItem = (item) => setItemModal({
    mode: 'edit',
    item,
    form: {
      ...BLANK_ITEM,
      ...item,
      status: item.status || (item.is_available ? 'active' : 'inactive'),
      pricing_mode: item.pricing_mode || 'variant',
      kitchen_route: item.kitchen_route || 'Main Kitchen',
      tax_included: item.tax_included !== false,
      tax_applicable: item.tax_applicable === true,
      discount_eligible: item.discount_eligible !== false,
      variants: (item.variants?.length ? item.variants : [{ name: 'Regular', price: item.price, badge: '' }])
        .map((v, index) => ({
          name: v.name || '',
          value_label: v.value_label || v.badge || '',
          price: v.price ?? '',
          weekend_price: v.weekend_price ?? '',
          cost: v.cost ?? '',
          badge: v.badge || '',
          is_default: v.is_default === true || index === 0,
          is_active: v.is_active !== false,
        })),
      addon_groups: (item.addon_groups?.length ? item.addon_groups : BLANK_ITEM.addon_groups)
        .map(group => ({
          name: group.name || '',
          min_select: group.min_select ?? 0,
          max_select: group.max_select ?? 3,
          is_active: group.is_active !== false,
          addons: (group.addons || []).map(addon => ({
            name: addon.name || '',
            price: addon.price ?? '',
            cost: addon.cost ?? '',
            is_active: addon.is_active !== false,
          })),
        })),
      weekend_days: Array.isArray(item.weekend_days) && item.weekend_days.length ? item.weekend_days : ['FRI', 'SAT'],
      weekend_price: item.weekend_price ?? '',
      open_price_role: item.open_price_role || 'manager',
    },
    pendingFile: null,
  });
  const openEditCategory = (category) => setCatModal({
    mode: 'edit',
    category,
    form: {
      ...BLANK_CAT,
      ...category,
      parent_id: category.parent_id || '',
      is_active: category.is_active !== false,
    },
  });

  const saveItem = async () => {
    const { mode, item, form, pendingFile } = itemModal;
    const variants = (form.variants || [])
      .map((v, index) => ({
        name: String(v.name || '').trim(),
        value_label: String(v.value_label || '').trim() || null,
        price: Number(v.price || 0),
        weekend_price: v.weekend_price === '' || v.weekend_price == null ? null : Number(v.weekend_price || 0),
        cost: Number(v.cost || 0),
        badge: String(v.value_label || v.badge || '').trim() || null,
        sort_order: index,
        is_default: v.is_default === true,
        is_active: v.is_active !== false,
      }))
      .filter(v => v.name && v.price >= 0);
    if (variants.length && !variants.some(v => v.is_default)) variants[0].is_default = true;
    const addon_groups = (form.addon_groups || [])
      .map((group, groupIndex) => ({
        name: String(group.name || '').trim(),
        min_select: Number(group.min_select || 0),
        max_select: Number(group.max_select || 0),
        sort_order: groupIndex,
        is_active: group.is_active !== false,
        addons: (group.addons || [])
          .map((addon, addonIndex) => ({
            name: String(addon.name || '').trim(),
            price: Number(addon.price || 0),
            cost: Number(addon.cost || 0),
            sort_order: addonIndex,
            is_active: addon.is_active !== false,
          }))
          .filter(addon => addon.name && addon.price >= 0),
      }))
      .filter(group => group.name && group.addons.length);
    if (!form.name.trim()) return toast.error('Item name required');
    if (!variants.length) return toast.error('Add at least one pricing row');

    setSaving(true);
    try {
      const defaultPrice = variants.find(v => v.is_default)?.price ?? variants[0].price;
      const payload = {
        ...form,
        name: form.name.trim(),
        description: form.description || null,
        category_id: form.category_id || null,
        price: defaultPrice,
        cost: Number(form.cost || variants.find(v => v.is_default)?.cost || 0),
        weekend_price: form.weekend_price === '' || form.weekend_price == null ? null : Number(form.weekend_price || 0),
        weekend_days: Array.isArray(form.weekend_days) && form.weekend_days.length ? form.weekend_days : ['FRI', 'SAT'],
        open_price_role: form.open_price_role || 'manager',
        prep_time_min: Number(form.prep_time_min || 10),
        sort_order: Number(form.sort_order || 0),
        is_available: form.status === 'active',
        variants,
        addon_groups,
      };
      const res = mode === 'edit' ? await updateMenuItem(item.id, payload) : await createMenuItem(payload);
      if (pendingFile && res.data?.id) await uploadMenuItemImage(res.data.id, pendingFile);
      toast.success(mode === 'edit' ? 'Menu item updated' : 'Menu item created');
      setItemModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save item');
    } finally {
      setSaving(false);
    }
  };

  const toggleSmartSort = async () => {
    const next = !smartSortEnabled;
    setSmartSortEnabled(next);
    try {
      await updateRestaurantSettings({ pos_smart_menu_sort_enabled: next });
      toast.success(next ? 'Smart POS display enabled' : 'Manual POS display enabled');
      load();
    } catch (err) {
      setSmartSortEnabled(!next);
      toast.error(err.response?.data?.error || 'Could not update POS display setting');
    }
  };

  const removeItem = async () => {
    if (!itemModal?.item?.id) return;
    if (!window.confirm(`Delete "${itemModal.item.name}" from the menu?`)) return;
    setSaving(true);
    try {
      const res = await deleteMenuItem(itemModal.item.id);
      toast.success(res.data?.message || 'Menu item deleted');
      setItemModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete item');
    } finally {
      setSaving(false);
    }
  };

  const removeCategory = async (category) => {
    if (!category?.id) return;
    if (!window.confirm(`Delete "${category.name}"? Categories with child records will be made inactive instead.`)) return;
    setSaving(true);
    try {
      const res = await deleteCategory(category.id);
      toast.success(res.data?.message || 'Category deleted');
      if (activeCategory === category.id) setActiveCategory('all');
      setCatModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete category');
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async () => {
    const { mode, category, form } = catModal;
    if (!form.name.trim()) return toast.error('Category name required');
    setSaving(true);
    try {
      const payload = { ...form, name: form.name.trim(), parent_id: form.parent_id || null, sort_order: Number(form.sort_order || 0) };
      if (mode === 'edit') await updateCategory(category.id, payload);
      else await createCategory(payload);
      toast.success(mode === 'edit' ? 'Category updated' : 'Category created');
      setCatModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save category');
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (item, file) => {
    if (!file) return;
    try {
      await uploadMenuItemImage(item.id, file);
      toast.success('Image uploaded');
      load();
    } catch {
      toast.error('Image upload failed');
    }
  };

  if (loading) return <div style={{ color: T.text, padding: 30 }}>Loading menu...</div>;

  return (
    <div style={S.page}>
      <div style={S.hero}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 18, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, background: C.slate100, padding: '5px 12px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2.4, color: C.slate600, fontWeight: 800, marginBottom: 12 }}>Menu Configuration</div>
            <h1 style={{ margin: 0, fontSize: 34, lineHeight: 1.1, color: T.text }}>Menu Management</h1>
            <p style={{ margin: '10px 0 0', color: T.textMid, maxWidth: 760 }}>
              Build clean category navigation, product cards, and variant-based pricing like Half / Full, Single / Family, or Small / Large.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <button type="button" onClick={toggleSmartSort} style={{ borderRadius: 16, padding: '12px 14px', cursor: 'pointer', fontWeight: 900, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, ...(smartSortEnabled ? S.active : S.inactive) }}>
              <span>Smart POS Display</span>
              <span>{smartSortEnabled ? 'ON' : 'OFF'}</span>
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(92px,1fr))', gap: 10 }}>
              {[
                ['Categories', categories.length],
                ['Menu Items', items.length],
                ['Pricing Rows', variantCount],
                ['Add-ons', addonCount],
              ].map(([label, value]) => (
                <div key={label} style={{ borderRadius: 16, ...S.soft, padding: '12px 14px' }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: T.text }}>{String(value).padStart(2, '0')}</div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 22 }}>
        <aside style={{ borderRadius: 22, ...S.panel, padding: 16, height: 'fit-content' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 18, color: T.text }}>Categories</h2>
            <button onClick={() => setCatModal({ mode: 'new', form: { ...BLANK_CAT } })} style={{ border: 0, borderRadius: 12, ...S.primary, padding: '8px 12px', fontWeight: 800, cursor: 'pointer' }}>+ Add</button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[{ id: 'all', name: 'All' }, ...categories].map(cat => {
              const active = activeCategory === cat.id;
              const isAll = cat.id === 'all';
              return (
                <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: isAll ? '1fr' : '1fr auto auto', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => setActiveCategory(cat.id)} style={{ width: '100%', borderRadius: 16, padding: '13px 14px', cursor: 'pointer', ...(active ? S.active : S.inactive), textAlign: 'left', fontWeight: active ? 800 : 600 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cat.name}{cat.is_active === false ? ' (Inactive)' : ''}
                      </span>
                      <span style={{ opacity: 0.7 }}>{cat.id === 'all' ? items.length : (categoryCounts[cat.id] || 0)}</span>
                    </span>
                  </button>
                  {!isAll && (
                    <>
                      <IconButton title={`Edit ${cat.name}`} icon="✎" onClick={() => openEditCategory(cat)} style={{ width: 38, height: 38 }} />
                      <IconButton title={`Delete ${cat.name}`} icon="🗑" tone="danger" onClick={() => removeCategory(cat)} style={{ width: 38, height: 38 }} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 18, borderRadius: 16, ...S.soft, padding: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, color: T.text }}>Recommended structure</h3>
            {['Category', 'Menu item master', 'Variants with separate prices', 'Optional add-ons and extras', 'Availability by branch or channel'].map(x => (
              <div key={x} style={{ marginTop: 10, color: T.textMid, fontSize: 13 }}>- {x}</div>
            ))}
          </div>
        </aside>

        <section>
          <div style={{ borderRadius: 22, ...S.panel, padding: 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search menu items..." style={{ ...inputStyle, width: 320, marginLeft: 'auto' }} />
              <button style={{ borderRadius: 14, ...S.secondary, padding: '12px 16px', cursor: 'pointer' }}>Filter</button>
              <button onClick={openNewItem} style={{ border: 0, borderRadius: 14, ...S.primary, padding: '12px 16px', fontWeight: 900, cursor: 'pointer' }}>+ New Item</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
            {filteredItems.map(item => (
              <div key={item.id} style={{ overflow: 'hidden', borderRadius: 20, ...S.card }}>
                <div style={{ position: 'relative', height: 150, overflow: 'hidden', background: S.image.background }}>
                  {imageUrl(item.image_url) ? <img src={imageUrl(item.image_url)} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: '#475569', fontSize: 42 }}>Menu</div>}
                  <div style={{ position: 'absolute', inset: 0, background: light ? 'linear-gradient(to top, rgba(15,23,42,0.10), transparent 55%)' : 'linear-gradient(to top, rgba(2,6,23,0.95), rgba(2,6,23,0.12), transparent)' }} />
                  <span style={{ position: 'absolute', left: 14, top: 14, borderRadius: 999, background: item.status === 'draft' ? '#f59e0b' : item.status === 'inactive' ? '#64748b' : '#10b981', color: '#fff', padding: '5px 10px', fontSize: 11, fontWeight: 800 }}>{item.status || 'active'}</span>
                  <button onClick={() => openEditItem(item)} style={{ position: 'absolute', right: 14, top: 14, borderRadius: 999, ...S.primary, border: `1px solid ${C.teal500}`, padding: '6px 12px', cursor: 'pointer', fontWeight: 800 }}>Edit</button>
                </div>
                <div style={{ padding: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
                    <h3 title={item.name} style={{ margin: 0, fontSize: 15, lineHeight: 1.2, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, color: T.text }}>{item.name}</h3>
                    <span style={{ borderRadius: 999, background: C.teal50, color: C.teal600, border: `1px solid ${C.teal100}`, padding: '5px 10px', fontSize: 11, fontWeight: 800 }}>{money(defaultVariant(item).price)}</span>
                  </div>
                  {item.description && <p style={{ color: T.textDim, fontSize: 13, lineHeight: 1.45, minHeight: 38, margin: '10px 0 12px' }}>{item.description}</p>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    {item.category_name && <span style={{ borderRadius: 999, background: C.slate100, color: T.textMid, padding: '5px 9px', fontSize: 11, fontWeight: 800 }}>{item.category_name}</span>}
                    <span style={{ borderRadius: 999, background: C.slate100, color: T.textMid, padding: '5px 9px', fontSize: 11, fontWeight: 800 }}>{PRICING_MODES.find(m => m.key === item.pricing_mode)?.label || 'Portion / Variant'}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {activeVariants(item).map(variant => (
                      <div key={`${item.id}-${variant.name}`} style={{ borderRadius: 16, ...S.soft, padding: '11px 13px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 800, color: T.text }}>{variant.name}</div>
                          {(variant.value_label || variant.badge) && <div style={{ color: T.textDim, fontSize: 11, marginTop: 2 }}>{variant.value_label || variant.badge}</div>}
                        </div>
                        <div style={{ color: C.teal600, fontWeight: 900 }}>{money(variant.price)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: T.textDim, fontSize: 12, marginTop: 14 }}>
                    <span>{[item.visible_pos && 'POS', item.visible_web && 'Web', item.visible_delivery && 'Delivery App'].filter(Boolean).join(', ') || 'Hidden'}</span>
                    <label style={{ color: T.text, fontWeight: 800, cursor: 'pointer' }}>
                      Manage
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadImage(item, e.target.files?.[0])} />
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {itemModal && (
        <Modal title={itemModal.mode === 'edit' ? 'Edit Menu Item' : 'New Menu Item'} onClose={() => setItemModal(null)} width={1180}>
          <ItemForm
            state={itemModal}
            setState={setItemModal}
            categories={categories}
            inputStyle={inputStyle}
            ui={S}
            T={T}
            labelColor={T.textDim}
            light={light}
            C={C}
            onCategoriesChanged={load}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            {itemModal.mode === 'edit' && (
              <button onClick={removeItem} disabled={saving} style={{ flex: 1, borderRadius: 14, border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', padding: 14, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer' }}>
                Delete
              </button>
            )}
            <button onClick={saveItem} disabled={saving} style={{ flex: 2, border: 0, borderRadius: 14, ...S.primary, padding: 14, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : 'Save Menu Item'}</button>
          </div>
        </Modal>
      )}

      {catModal && (
        <Modal title={catModal.mode === 'edit' ? 'Edit Category' : 'New Category'} onClose={() => setCatModal(null)} width={500}>
          <CategoryForm state={catModal} setState={setCatModal} categories={allCategories} inputStyle={inputStyle} labelColor={T.textDim} />
          <div style={{ display: 'flex', gap: 10 }}>
            {catModal.mode === 'edit' && <IconButton title="Delete category" icon="🗑" tone="danger" onClick={() => removeCategory(catModal.category)} style={{ width: 48, height: 48, borderRadius: 14, fontWeight: 900 }} />}
            <button onClick={saveCategory} disabled={saving} style={{ flex: 2, border: 0, borderRadius: 14, ...S.primary, padding: 14, fontWeight: 900, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : 'Save Category'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ItemForm({ state, setState, categories, inputStyle, ui, T, labelColor, light, C, onCategoriesChanged }) {
  const form = state.form;
  const [categorySearch, setCategorySearch] = React.useState('');
  const [showAdvancedRules, setShowAdvancedRules] = React.useState(false);
  const [addingCategory, setAddingCategory] = React.useState(false);
  const [newCategoryName, setNewCategoryName] = React.useState('');
  const [newCategorySaving, setNewCategorySaving] = React.useState(false);
  const set = (key, value) => setState(s => ({ ...s, form: { ...s.form, [key]: value } }));
  const setVariant = (index, patch) => set('variants', form.variants.map((v, i) => i === index ? { ...v, ...patch } : v));
  const toggleWeekendDay = (day) => {
    const days = Array.isArray(form.weekend_days) ? form.weekend_days : [];
    set('weekend_days', days.includes(day) ? days.filter(d => d !== day) : [...days, day]);
  };
  const setGroup = (index, patch) => set('addon_groups', form.addon_groups.map((g, i) => i === index ? { ...g, ...patch } : g));
  const setAddon = (groupIndex, addonIndex, patch) => {
    const groups = form.addon_groups.map((g, i) => i !== groupIndex ? g : {
      ...g,
      addons: (g.addons || []).map((a, j) => j === addonIndex ? { ...a, ...patch } : a),
    });
    set('addon_groups', groups);
  };
  const selectMode = (mode) => setState(s => ({
    ...s,
    form: { ...s.form, pricing_mode: mode, variants: VARIANT_TEMPLATES[mode].map(v => ({ ...v })) },
  }));
  const filteredCategories = categories.filter(c => !categorySearch.trim() || c.name.toLowerCase().includes(categorySearch.trim().toLowerCase()));
  const selectedCategory = categories.find(c => c.id === form.category_id);
  const createInlineCategory = async () => {
    const name = newCategoryName.trim() || categorySearch.trim();
    if (!name) return toast.error('Category name required');
    setNewCategorySaving(true);
    try {
      const res = await createCategory({ name, description: null, parent_id: null, sort_order: categories.length });
      set('category_id', res.data.id);
      setCategorySearch('');
      setNewCategoryName('');
      setAddingCategory(false);
      toast.success('Category created');
      onCategoriesChanged && onCategoriesChanged();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not create category');
    } finally {
      setNewCategorySaving(false);
    }
  };
  const ruleCardStyle = {
    borderRadius: 24,
    background: C.white,
    border: `1px solid ${light ? C.white : C.slate200}`,
    boxShadow: light ? '0 1px 3px rgba(15,23,42,0.08)' : '0 12px 28px rgba(0,0,0,0.18)',
    padding: 13,
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.1fr) minmax(340px,0.9fr)', gap: 18 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <Panel title="1. Item Setup" subtitle="Name, media, category, kitchen route, and status." ui={ui} T={T}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Item name" labelColor={labelColor}><input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Chicken Achari Karahi" /></Field>
            <Field label="Prep time" labelColor={labelColor}><input style={inputStyle} type="number" value={form.prep_time_min || ''} onChange={e => set('prep_time_min', e.target.value)} /></Field>
            <Field label="Status" labelColor={labelColor}><select style={inputStyle} value={form.status || 'active'} onChange={e => set('status', e.target.value)}><option value="active">Active</option><option value="draft">Draft</option><option value="inactive">Inactive</option></select></Field>
            <Field label="Kitchen route" labelColor={labelColor}><input style={inputStyle} value={form.kitchen_route || ''} onChange={e => set('kitchen_route', e.target.value)} /></Field>
            <Field label="POS Display Order" labelColor={labelColor}><input style={inputStyle} type="number" value={form.sort_order ?? 0} onChange={e => set('sort_order', e.target.value)} placeholder="0" /></Field>
            <Toggle on={form.is_popular} label="Mark Popular" onClick={() => set('is_popular', !form.is_popular)} ui={ui} />
          </div>
          <Field label="Description" labelColor={labelColor}><textarea style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }} value={form.description || ''} onChange={e => set('description', e.target.value)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '0.85fr 1.15fr', gap: 14 }}>
            <div style={{ borderRadius: 18, border: `1px dashed ${light ? '#cbd5e1' : 'rgba(255,255,255,0.18)'}`, background: light ? '#f8fafc' : 'rgba(255,255,255,0.04)', padding: 14, minHeight: 190, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
              {state.pendingPreview || imageUrl(form.image_url) ? (
                <img src={state.pendingPreview || imageUrl(form.image_url)} alt={form.name || 'Menu item'} style={{ width: '100%', height: 176, borderRadius: 14, objectFit: 'cover' }} />
              ) : <strong style={{ color: T.textDim }}>Item Media</strong>}
              <label style={{ marginTop: 10, borderRadius: 12, ...ui.primary, padding: '10px 13px', fontWeight: 900, cursor: 'pointer' }}>
                Upload Image
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setState(s => ({ ...s, pendingFile: file, pendingPreview: URL.createObjectURL(file) }));
                }} />
              </label>
            </div>
            <div style={{ borderRadius: 18, ...ui.soft, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                <div>
                  <div style={{ color: T.text, fontWeight: 900 }}>Category Link</div>
                  <div style={{ color: T.textDim, fontSize: 13, marginTop: 4 }}>{selectedCategory?.name || 'No category selected'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAddingCategory(v => !v);
                    setNewCategoryName(categorySearch);
                  }}
                  style={{ borderRadius: 14, ...ui.secondary, padding: '8px 10px', cursor: 'pointer', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}
                >
                  + Add Category
                </button>
              </div>
              <input value={categorySearch} onChange={e => setCategorySearch(e.target.value)} placeholder="Search category..." style={{ ...inputStyle, marginTop: 12 }} />
              {addingCategory && (
                <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 7, alignItems: 'center' }}>
                  <input
                    value={newCategoryName}
                    onChange={e => setNewCategoryName(e.target.value)}
                    placeholder="New category name"
                    style={{ ...inputStyle, padding: '9px 10px', borderRadius: 12, fontSize: 13 }}
                  />
                  <button type="button" onClick={createInlineCategory} disabled={newCategorySaving} style={{ border: 0, borderRadius: 12, ...ui.primary, padding: '9px 11px', cursor: newCategorySaving ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: 12 }}>
                    {newCategorySaving ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => { setAddingCategory(false); setNewCategoryName(''); }} style={{ borderRadius: 12, ...ui.secondary, padding: '9px 10px', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                    Cancel
                  </button>
                </div>
              )}
              {!addingCategory && categorySearch.trim() && filteredCategories.length === 0 && (
                <button type="button" onClick={() => { setAddingCategory(true); setNewCategoryName(categorySearch); }} style={{ marginTop: 10, width: '100%', borderRadius: 12, border: `1px dashed ${C.teal500}`, background: C.teal50, color: C.teal600, padding: '9px 10px', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>
                  Add "{categorySearch.trim()}"
                </button>
              )}
              <div style={{ display: 'grid', gap: 7, marginTop: 10, maxHeight: 178, overflow: 'auto' }}>
                {filteredCategories.map(cat => <button key={cat.id} type="button" onClick={() => set('category_id', cat.id)} style={{ borderRadius: 12, padding: '10px 12px', textAlign: 'left', cursor: 'pointer', fontWeight: 800, ...(form.category_id === cat.id ? ui.active : ui.inactive) }}>{cat.name}</button>)}
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="2. Pricing Mode" subtitle="Controls how this item is sold on POS." ui={ui} T={T}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            {PRICING_MODES.map(mode => {
              const active = form.pricing_mode === mode.key;
              return <button key={mode.key} type="button" onClick={() => selectMode(mode.key)} style={{ borderRadius: 15, padding: 13, textAlign: 'left', cursor: 'pointer', ...(active ? ui.active : ui.inactive) }}><strong>{mode.label}</strong><div style={{ marginTop: 5, fontSize: 12, opacity: 0.75 }}>{mode.helper}</div></button>;
            })}
          </div>
        </Panel>

        <Panel
          title="3. Pricing Configuration"
          subtitle="Visibility, tax, VAT, discount rules, and pricing rows."
          action={
            <button type="button" onClick={() => setShowAdvancedRules(v => !v)} style={{ borderRadius: 13, ...ui.inactive, padding: '9px 12px', cursor: 'pointer', fontWeight: 800 }}>
              Advanced Rules
            </button>
          }
          ui={ui}
          T={T}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 14 }}>
            <Toggle on={form.visible_pos} label="Visible on POS" onClick={() => set('visible_pos', !form.visible_pos)} ui={ui} />
            <Toggle on={form.visible_web} label="Visible on Website" onClick={() => set('visible_web', !form.visible_web)} ui={ui} />
            <Toggle on={form.visible_delivery} label="Visible on Delivery App" onClick={() => set('visible_delivery', !form.visible_delivery)} ui={ui} />
            <Toggle on={form.discount_eligible} label="Allow Discount" onClick={() => set('discount_eligible', !form.discount_eligible)} ui={ui} />
            <Toggle on={form.tax_applicable} label="Tax Applicable" onClick={() => set('tax_applicable', !form.tax_applicable)} ui={ui} />
            <Toggle on={form.tax_included} label="VAT Included" onClick={() => set('tax_included', !form.tax_included)} ui={ui} />
          </div>

          {showAdvancedRules && (
            <div style={{ marginBottom: 14, borderRadius: 24, border: `1px solid ${C.teal100}`, background: C.teal50, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 13 }}>
                <div>
                  <strong style={{ color: T.text }}>Advanced Rules</strong>
                  <div style={{ color: T.textMid, fontSize: 13, marginTop: 4 }}>Detailed controls for quantity behavior, price authority, rounding, service charge, and combo logic.</div>
                </div>
                <button type="button" onClick={() => setShowAdvancedRules(false)} style={{ borderRadius: 12, ...ui.inactive, padding: '8px 11px', cursor: 'pointer', fontWeight: 800 }}>Close</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={ruleCardStyle}>
                  <strong style={{ color: T.text }}>Quantity Rules</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 9, marginTop: 12 }}>
                    <Field label="Minimum Qty" labelColor={labelColor}><input style={inputStyle} type="number" value={form.min_qty ?? 1} onChange={e => set('min_qty', e.target.value)} /></Field>
                    <Field label="Maximum Qty" labelColor={labelColor}><input style={inputStyle} type="number" value={form.max_qty ?? 10} onChange={e => set('max_qty', e.target.value)} /></Field>
                    <Field label="Step Qty" labelColor={labelColor}><input style={inputStyle} type="number" value={form.step_qty ?? 1} onChange={e => set('step_qty', e.target.value)} /></Field>
                  </div>
                </div>

                <div style={ruleCardStyle}>
                  <strong style={{ color: T.text }}>Rounding & Charges</strong>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 12 }}>
                    <Field label="Round Off Rule" labelColor={labelColor}>
                      <select style={inputStyle} value={form.round_off_rule || 'nearest_0_50'} onChange={e => set('round_off_rule', e.target.value)}>
                        <option value="none">No rounding</option>
                        <option value="nearest_0_50">Nearest 0.50</option>
                        <option value="nearest_1">Nearest 1.00</option>
                        <option value="nearest_5">Nearest 5.00</option>
                      </select>
                    </Field>
                    <Field label="Service Charge %" labelColor={labelColor}><input style={inputStyle} type="number" value={form.service_charge_percent ?? 0} onChange={e => set('service_charge_percent', e.target.value)} /></Field>
                  </div>
                </div>

                <div style={ruleCardStyle}>
                  <strong style={{ color: T.text }}>Price Authority</strong>
                  <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
                    <Field label="Price Override Allowed" labelColor={labelColor}>
                      <select style={inputStyle} value={form.price_override_role || 'manager_only'} onChange={e => set('price_override_role', e.target.value)}>
                        <option value="not_allowed">Not Allowed</option>
                        <option value="manager_only">Manager Only</option>
                        <option value="cashier_allowed">Cashier Allowed</option>
                      </select>
                    </Field>
                    <Toggle on={form.allow_open_price} label="Allow Open Price" onClick={() => set('allow_open_price', !form.allow_open_price)} ui={ui} />
                    {form.allow_open_price && (
                      <Field label="Open Price Role" labelColor={labelColor}>
                        <select style={inputStyle} value={form.open_price_role || 'manager'} onChange={e => set('open_price_role', e.target.value)}>
                          <option value="manager">Manager</option>
                          <option value="admin">Admin</option>
                          <option value="cashier">Cashier</option>
                        </select>
                      </Field>
                    )}
                    <Toggle on={form.hide_cost_on_pos} label="Hide Cost on POS" onClick={() => set('hide_cost_on_pos', !form.hide_cost_on_pos)} ui={ui} />
                  </div>
                </div>

                <div style={ruleCardStyle}>
                  <strong style={{ color: T.text }}>Promotion & Bundles</strong>
                  <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
                    <Toggle on={form.combo_eligible} label="Combo Eligible" onClick={() => set('combo_eligible', !form.combo_eligible)} ui={ui} />
                    <Toggle on={form.weekend_price_rule} label="Weekend Price Rule" onClick={() => set('weekend_price_rule', !form.weekend_price_rule)} ui={ui} />
                    {form.weekend_price_rule && (
                      <>
                        <Field label="Default Weekend Price" labelColor={labelColor}>
                          <input style={inputStyle} type="number" value={form.weekend_price ?? ''} onChange={e => set('weekend_price', e.target.value)} placeholder="1350" />
                        </Field>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: labelColor, marginBottom: 6 }}>Weekend Days</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {WEEKDAY_OPTIONS.map(day => {
                              const active = (form.weekend_days || []).includes(day);
                              return (
                                <button key={day} type="button" onClick={() => toggleWeekendDay(day)} style={{ borderRadius: 999, padding: '7px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', ...(active ? ui.active : ui.inactive) }}>
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                    <Field label="Promotion Label" labelColor={labelColor}><input style={inputStyle} value={form.promotion_label || ''} onChange={e => set('promotion_label', e.target.value)} placeholder="Chef Special" /></Field>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div style={{ overflow: 'auto', borderRadius: 14, border: ui.soft.border }}>
            <div style={{ minWidth: form.weekend_price_rule ? 820 : 720 }}>
              <div style={{ display: 'grid', gridTemplateColumns: form.weekend_price_rule ? '1fr 1fr 108px 108px 108px 78px 38px' : '1fr 1fr 118px 118px 86px 38px', gap: 8, padding: 10, color: T.textDim, fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
                <div>Label</div><div>{form.pricing_mode === 'variant' ? 'Serving' : form.pricing_mode === 'weight' ? 'Weight' : 'Qty'}</div><div>Selling</div>{form.weekend_price_rule && <div>Weekend</div>}<div>Cost</div><div>Default</div><div />
              </div>
              {form.variants.map((variant, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: form.weekend_price_rule ? '1fr 1fr 108px 108px 108px 78px 38px' : '1fr 1fr 118px 118px 86px 38px', gap: 8, padding: 10, borderTop: ui.soft.border }}>
                  <input style={inputStyle} value={variant.name || ''} onChange={e => setVariant(index, { name: e.target.value })} />
                  <input style={inputStyle} value={variant.value_label || ''} onChange={e => setVariant(index, { value_label: e.target.value })} />
                  <input style={inputStyle} type="number" value={variant.price ?? ''} onChange={e => setVariant(index, { price: e.target.value })} />
                  {form.weekend_price_rule && <input style={inputStyle} type="number" value={variant.weekend_price ?? ''} onChange={e => setVariant(index, { weekend_price: e.target.value })} placeholder={form.weekend_price || 'Auto'} />}
                  <input style={inputStyle} type="number" value={variant.cost ?? ''} onChange={e => setVariant(index, { cost: e.target.value })} />
                  <button type="button" onClick={() => set('variants', form.variants.map((v, i) => ({ ...v, is_default: i === index })))} style={{ borderRadius: 10, cursor: 'pointer', fontWeight: 800, ...(variant.is_default ? ui.active : ui.inactive) }}>{variant.is_default ? 'Yes' : 'No'}</button>
                  <button type="button" onClick={() => set('variants', form.variants.filter((_, i) => i !== index))} style={{ border: 0, borderRadius: 10, ...ui.primary, cursor: 'pointer' }}>x</button>
                </div>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => set('variants', [...form.variants, { ...BLANK_VARIANT }])} style={{ borderRadius: 12, border: ui.soft.border, background: 'transparent', color: T.text, padding: 11, width: '100%', cursor: 'pointer', marginTop: 12, fontWeight: 800 }}>+ Add Pricing Row</button>
        </Panel>

        <Panel title="4. Add-ons" subtitle="Add-ons inherit tax, VAT, and discount rules from pricing configuration." ui={ui} T={T}>
          <div style={{ display: 'grid', gap: 12 }}>
            {(form.addon_groups || []).map((group, groupIndex) => (
              <div key={groupIndex} style={{ borderRadius: 18, ...ui.soft, padding: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1fr) 82px 82px 34px', gap: 6, alignItems: 'center' }}>
                  <input style={{ ...inputStyle, padding: '9px 10px', borderRadius: 12, fontSize: 13 }} value={group.name || ''} onChange={e => setGroup(groupIndex, { name: e.target.value })} placeholder="Extra Sides" />
                  <input style={{ ...inputStyle, padding: '9px 8px', borderRadius: 12, fontSize: 13 }} type="number" value={group.min_select ?? 0} onChange={e => setGroup(groupIndex, { min_select: e.target.value })} placeholder="Min" />
                  <input style={{ ...inputStyle, padding: '9px 8px', borderRadius: 12, fontSize: 13 }} type="number" value={group.max_select ?? 3} onChange={e => setGroup(groupIndex, { max_select: e.target.value })} placeholder="Max" />
                  <button type="button" onClick={() => set('addon_groups', form.addon_groups.filter((_, i) => i !== groupIndex))} style={{ border: 0, borderRadius: 9, ...ui.primary, cursor: 'pointer', height: 36, width: 34 }}>x</button>
                </div>

                <div style={{ marginTop: 10, overflow: 'hidden', borderRadius: 14, border: ui.soft.border }}>
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) 82px 82px 76px 32px', gap: 6, padding: '8px 9px', color: T.textDim, fontSize: 10, fontWeight: 900, textTransform: 'uppercase' }}>
                      <div>Name</div><div>Selling</div><div>Cost</div><div>Status</div><div />
                    </div>
                    {(group.addons || []).map((addon, addonIndex) => (
                      <div key={addonIndex} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) 82px 82px 76px 32px', gap: 6, padding: '8px 9px', borderTop: ui.soft.border }}>
                        <input style={{ ...inputStyle, padding: '8px 9px', borderRadius: 11, fontSize: 13 }} value={addon.name || ''} onChange={e => setAddon(groupIndex, addonIndex, { name: e.target.value })} />
                        <input style={{ ...inputStyle, padding: '8px 7px', borderRadius: 11, fontSize: 13 }} type="number" value={addon.price ?? ''} onChange={e => setAddon(groupIndex, addonIndex, { price: e.target.value })} />
                        <input style={{ ...inputStyle, padding: '8px 7px', borderRadius: 11, fontSize: 13 }} type="number" value={addon.cost ?? ''} onChange={e => setAddon(groupIndex, addonIndex, { cost: e.target.value })} />
                        <button type="button" onClick={() => setAddon(groupIndex, addonIndex, { is_active: addon.is_active === false })} style={{ borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 12, padding: '0 6px', ...(addon.is_active !== false ? ui.active : ui.inactive) }}>{addon.is_active !== false ? 'Active' : 'Off'}</button>
                        <button type="button" onClick={() => setGroup(groupIndex, { addons: group.addons.filter((_, i) => i !== addonIndex) })} style={{ border: 0, borderRadius: 9, ...ui.primary, cursor: 'pointer', width: 32 }}>x</button>
                      </div>
                    ))}
                  </div>
                </div>

                <button type="button" onClick={() => setGroup(groupIndex, { addons: [...(group.addons || []), { name: '', price: '', cost: '', is_active: true }] })} style={{ marginTop: 9, borderRadius: 11, ...ui.inactive, padding: '8px 10px', cursor: 'pointer', fontWeight: 800, fontSize: 13 }}>+ Add Add-on</button>
              </div>
            ))}
            <button type="button" onClick={() => set('addon_groups', [...(form.addon_groups || []), { name: 'New Add-on Group', min_select: 0, max_select: 1, addons: [{ name: '', price: '', cost: '', is_active: true }] }])} style={{ borderRadius: 12, border: ui.soft.border, background: 'transparent', color: T.text, padding: 11, cursor: 'pointer', fontWeight: 900 }}>+ Add Group</button>
          </div>
        </Panel>
      </div>

      <POSPreview form={form} category={selectedCategory} ui={ui} T={T} light={light} C={C} />
    </div>
  );
}

function Panel({ title, subtitle, children, action, ui, T }) {
  return (
    <section style={{ borderRadius: 18, ...ui.panel, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: ui.panel.border, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
        <div>
          <h3 style={{ margin: 0, color: T.text, fontSize: 16 }}>{title}</h3>
          {subtitle && <p style={{ margin: '5px 0 0', color: T.textDim, fontSize: 13 }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </section>
  );
}

function Toggle({ on, label, onClick, ui }) {
  const C = ui.colors;
  return (
    <button type="button" onClick={onClick} style={{ borderRadius: 16, padding: '12px 14px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, ...(on ? ui.active : ui.inactive) }}>
      <span>{label}</span>
      <span style={{ position: 'relative', width: 44, height: 24, borderRadius: 999, background: on ? C.teal500 : C.slate300, flexShrink: 0 }}>
        <span style={{ position: 'absolute', top: 4, left: on ? 24 : 4, width: 16, height: 16, borderRadius: '50%', background: C.white, transition: 'left 0.15s ease' }} />
      </span>
    </button>
  );
}

function POSPreview({ form, category, ui, T, light, C }) {
  const variants = activeVariants(form);
  const selected = defaultVariant(form);
  const group = form.addon_groups?.[0];
  const addons = (group?.addons || []).filter(addon => addon.name);
  const addonTotal = addons.slice(0, 2).reduce((sum, addon) => sum + Number(addon.price || 0), 0);
  const subtotal = Number(selected.price || 0) + addonTotal;
  const serviceCharge = subtotal * (Number(form.service_charge_percent || 0) / 100);
  const total = subtotal + serviceCharge;

  return (
    <aside style={{ position: 'sticky', top: 16, height: 'fit-content' }}>
      <div style={{ borderRadius: 20, overflow: 'hidden', ...ui.panel }}>
        <div style={{ background: light ? `linear-gradient(90deg, ${C.slate900}, ${C.slate800})` : 'linear-gradient(90deg,#020617,#111827)', color: '#fff', padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ color: '#cbd5e1', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2 }}>POS Preview</div>
              <strong style={{ display: 'block', marginTop: 5, fontSize: 18 }}>Cashier View</strong>
            </div>
            <span style={{ borderRadius: 999, background: 'rgba(255,255,255,0.12)', padding: '6px 10px', fontSize: 12 }}>{PRICING_MODES.find(m => m.key === form.pricing_mode)?.label}</span>
          </div>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ borderRadius: 18, ...ui.soft, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div>
                <h3 style={{ margin: 0, color: T.text, fontSize: 18 }}>{form.name || 'Untitled Item'}</h3>
                <div style={{ color: T.textDim, fontSize: 13, marginTop: 5 }}>{category?.name || 'Category linked'} - {form.status === 'active' ? 'Available in POS' : form.status}</div>
              </div>
              <div style={{ borderRadius: 16, background: C.white, border: ui.soft.border, padding: '8px 10px', textAlign: 'right' }}>
                <div style={{ color: T.textDim, fontSize: 11 }}>Base</div>
                <strong style={{ color: T.text }}>{money(selected.price)}</strong>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 9, marginTop: 14 }}>
              {variants.map(variant => (
                <div key={variant.name} style={{ borderRadius: 14, ...(variant === selected ? ui.active : ui.inactive), padding: '11px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 800 }}>
                  <span>{variant.name}</span>
                  <span>{money(variant.price)}</span>
                </div>
              ))}
            </div>
            {group && (
              <div style={{ marginTop: 14, borderRadius: 14, border: `1px dashed ${light ? '#cbd5e1' : 'rgba(255,255,255,0.18)'}`, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <strong style={{ color: T.text }}>{group.name || 'Add-ons'}</strong>
                  <span style={{ color: T.textDim, fontSize: 12 }}>Max {group.max_select || 0}</span>
                </div>
                <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
                  {addons.slice(0, 3).map((addon, index) => (
                    <div key={index} style={{ borderRadius: 12, ...(index < 2 ? ui.active : ui.inactive), padding: '9px 11px', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span>{addon.name}</span>
                      <span>+ {money(addon.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 14, borderRadius: 24, background: light ? C.slate900 : '#020617', color: '#fff', padding: 15 }}>
            <PreviewLine label="Selected item" value={money(selected.price)} />
            <PreviewLine label="Add-ons" value={money(addonTotal)} />
            {Number(form.service_charge_percent || 0) > 0 && <PreviewLine label={`Service charge (${form.service_charge_percent}%)`} value={money(serviceCharge)} />}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: 12, paddingTop: 12, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <span style={{ fontWeight: 800 }}>Order total {form.tax_applicable ? '(incl tax)' : ''} {form.discount_eligible ? '(discount applied)' : ''}</span>
              <strong style={{ fontSize: 18 }}>{money(total)}</strong>
            </div>
            <button type="button" style={{ marginTop: 13, width: '100%', border: 0, borderRadius: 16, ...ui.primary, padding: 12, fontWeight: 900 }}>Add to Order</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function PreviewLine({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: '#cbd5e1', fontSize: 13, marginTop: 8 }}><span>{label}</span><span>{value}</span></div>;
}

function CategoryForm({ state, setState, categories, inputStyle, labelColor }) {
  const form = state.form;
  const set = (key, value) => setState(s => ({ ...s, form: { ...s.form, [key]: value } }));
  const parents = categories.filter(c => !c.parent_id && c.id !== state.category?.id);
  return (
    <div>
      <Field label="Category name" labelColor={labelColor}><input style={inputStyle} value={form.name} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="Description" labelColor={labelColor}><textarea style={{ ...inputStyle, minHeight: 70 }} value={form.description || ''} onChange={e => set('description', e.target.value)} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
        <Field label="Parent" labelColor={labelColor}><select style={inputStyle} value={form.parent_id || ''} onChange={e => set('parent_id', e.target.value)}><option value="">Top level</option>{parents.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Sort" labelColor={labelColor}><input style={inputStyle} type="number" value={form.sort_order || 0} onChange={e => set('sort_order', e.target.value)} /></Field>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, color: labelColor, fontSize: 13, fontWeight: 800 }}>
        <input type="checkbox" checked={form.is_active !== false} onChange={e => set('is_active', e.target.checked)} />
        Active in POS / Orders
      </label>
    </div>
  );
}
