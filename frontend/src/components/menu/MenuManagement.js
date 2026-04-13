import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getMenu, createMenuItem, updateMenuItem, uploadMenuItemImage } from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, Input, Select, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

// For IMAGE src attributes, we need the full backend URL because browser <img> tags
// bypass React's dev proxy. REACT_APP_SOCKET_URL = http://localhost:5000 (backend root).
// Falls back to port 5000 on the same hostname.
const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

// ─── Image with fallback ──────────────────────────────────────────────────────
const MenuImage = ({ src, name, size = 56 }) => {
  const [err, setErr] = useState(false);
  // Reset error state when src changes so a newly uploaded image shows
  const prevSrc = React.useRef(src);
  if (prevSrc.current !== src) { prevSrc.current = src; setErr(false); }
  const url = src && !err ? (src.startsWith('http') ? src : `${IMG_BASE}${src}`) : null;
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0, overflow: 'hidden',
      background: T.surface, border: `1px solid ${T.border}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {url
        ? <img key={src} src={url} alt={name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <span style={{ fontSize: size * 0.45 }}>🍽</span>
      }
    </div>
  );
};

// ─── Image Upload Zone ────────────────────────────────────────────────────────
const ImageUploadZone = ({ itemId, currentUrl, onUploaded }) => {
  const inputRef  = useRef();
  const [uploading, setUploading] = useState(false);
  const [preview,   setPreview]   = useState(null);
  const [dragging,  setDragging]  = useState(false);

  // Track whether the current preview is a local blob (just uploaded this session)
  const isLocalBlob = React.useRef(false);

  useEffect(() => {
    // Only set preview from server URL on initial open (no local blob active yet)
    if (!isLocalBlob.current) {
      if (currentUrl) {
        const url = currentUrl.startsWith('http') ? currentUrl : `${IMG_BASE}${currentUrl}`;
        setPreview(url);
      } else {
        setPreview(null);
      }
    }
  }, [currentUrl]);

  const handleFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) return toast.error('Please select an image file');
    if (file.size > 5 * 1024 * 1024) return toast.error('Image must be under 5MB');

    // Show local blob preview immediately — don't wait for upload
    const blobUrl = URL.createObjectURL(file);
    isLocalBlob.current = true;
    setPreview(blobUrl);

    if (!itemId) {
      // Item not saved yet — hold file for parent to upload after save
      onUploaded && onUploaded(null, file);
      return;
    }

    setUploading(true);
    try {
      const res = await uploadMenuItemImage(itemId, file);
      toast.success('Image uploaded!');
      // Keep the local blob preview — it looks fine and avoids the proxy issue.
      // Pass back the server URL so the parent can persist it.
      onUploaded && onUploaded(res.data.image_url, null);
    } catch {
      toast.error('Upload failed');
      isLocalBlob.current = false;
      setPreview(currentUrl ? (currentUrl.startsWith('http') ? currentUrl : `${IMG_BASE}${currentUrl}`) : null);
    } finally { setUploading(false); }
  };

  const onDrop = e => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${dragging ? T.accent : T.border}`,
          borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
          background: dragging ? T.accentGlow : T.surface,
          overflow: 'hidden', position: 'relative',
          height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {preview ? (
          <>
            <img src={preview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 0.2s',
            }} className="img-hover-overlay">
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Change Image</span>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: T.textDim, padding: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>
              {uploading ? 'Uploading…' : 'Click or drag & drop'}
            </div>
            <div style={{ fontSize: 11, marginTop: 4 }}>JPG, PNG, WEBP · max 5MB</div>
          </div>
        )}
        {uploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>⏳ Uploading…</span>
          </div>
        )}
      </div>
      {preview && (
        <button onClick={(e) => { e.stopPropagation(); isLocalBlob.current = false; setPreview(null); onUploaded && onUploaded('', null); }}
          style={{ marginTop: 6, background: 'none', border: 'none', color: T.red, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
          × Remove image
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ''; }} />
      <style>{`.img-hover-overlay { opacity: 0 !important; } div:hover > .img-hover-overlay { opacity: 1 !important; }`}</style>
    </div>
  );
};

// ─── Add / Edit Item Modal ────────────────────────────────────────────────────
const BLANK_ITEM = {
  name: '', description: '', price: '', cost: '', category_id: '',
  prep_time_min: 10, is_popular: false, is_available: true,
  tags: '', allergens: '', image_url: '',
};

function ItemModal({ open, onClose, onSaved, editItem, categories }) {
  const [form,      setForm]      = useState(BLANK_ITEM);
  const [saving,    setSaving]    = useState(false);
  const [pendingFile, setPendingFile] = useState(null); // file held before item exists
  const isEdit = !!editItem;

  useEffect(() => {
    if (open) {
      setForm(editItem ? {
        ...BLANK_ITEM, ...editItem,
        tags:      (editItem.tags || []).join(', '),
        allergens: (editItem.allergens || []).join(', '),
      } : { ...BLANK_ITEM });
      setPendingFile(null);
    }
  }, [open, editItem]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Item name required');
    if (!form.price)       return toast.error('Price required');
    setSaving(true);
    try {
      // Strip blob: URLs — backend only accepts /uploads/ paths
      const imageUrlForPayload = form.image_url?.startsWith('/uploads/') ? form.image_url : undefined;
      const payload = {
        ...form,
        image_url:    imageUrlForPayload,
        price:        parseFloat(form.price),
        cost:         parseFloat(form.cost) || 0,
        prep_time_min: parseInt(form.prep_time_min) || 10,
        tags:      form.tags      ? form.tags.split(',').map(s => s.trim()).filter(Boolean)      : [],
        allergens: form.allergens ? form.allergens.split(',').map(s => s.trim()).filter(Boolean) : [],
      };

      let savedItem;
      if (isEdit) {
        const res = await updateMenuItem(editItem.id, payload);
        savedItem = res.data;
        toast.success('Item updated!');
      } else {
        const res = await createMenuItem(payload);
        savedItem = res.data;
        toast.success('Item added!');
      }

      // Upload pending image (new items: file held until item ID exists)
      if (pendingFile && savedItem?.id) {
        try {
          await uploadMenuItemImage(savedItem.id, pendingFile);
          toast.success('Image uploaded!');
        } catch { toast.error('Item saved but image upload failed'); }
      }

      onSaved();  // reload menu grid AFTER all uploads complete
      onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit: ${editItem?.name}` : 'Add Menu Item'} width={580}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 20 }}>
        {/* Left: fields */}
        <div>
          <Input label="Item Name *" value={form.name} onChange={set('name')} placeholder="e.g. Beef Ribeye 250g" />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: T.textMid, fontWeight: 600, marginBottom: 6 }}>Description</div>
            <textarea value={form.description} onChange={set('description')}
              placeholder="Short description shown on menu…"
              style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', resize: 'vertical', minHeight: 72 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Input label="Selling Price (PKR) *" type="number" value={form.price} onChange={set('price')} placeholder="1400" />
            <Input label="Cost Price (PKR)"      type="number" value={form.cost}  onChange={set('cost')}  placeholder="400" />
            <Input label="Prep Time (min)"       type="number" value={form.prep_time_min} onChange={set('prep_time_min')} placeholder="15" />
            <Select label="Category" value={form.category_id} onChange={set('category_id')}>
              <option value="">— No Category —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>
          <Input label="Tags (comma separated)" value={form.tags} onChange={set('tags')} placeholder="spicy, grilled, chef-special" />
          <Input label="Allergens (comma separated)" value={form.allergens} onChange={set('allergens')} placeholder="nuts, gluten, dairy" />

          {/* Toggles */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {[['⭐ Popular', 'is_popular'], ['✅ Available', 'is_available']].map(([label, key]) => (
              <div key={key} onClick={() => setVal(key, !form[key])} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                background: form[key] ? T.accentGlow : T.surface,
                border: `1px solid ${form[key] ? T.accent + '66' : T.border}`,
                flex: 1,
              }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: form[key] ? T.accent : T.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {form[key] && <span style={{ color: '#000', fontSize: 10, fontWeight: 800 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: form[key] ? T.accent : T.textMid }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: image upload */}
        <div>
          <div style={{ fontSize: 12, color: T.textMid, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Item Photo</div>
          <ImageUploadZone
            itemId={editItem?.id}
            currentUrl={form.image_url}
            onUploaded={(url, file) => {
              if (file) setPendingFile(file);
              if (url !== null) setVal('image_url', url || '');
            }}
          />
          {!isEdit && pendingFile && (
            <div style={{ marginTop: 6, fontSize: 11, color: T.green }}>✓ Image ready — will upload after save</div>
          )}
        </div>
      </div>

      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%', marginTop: 16 }}>
        {saving ? '⏳ Saving…' : isEdit ? '✓ Save Changes' : '✓ Add to Menu'}
      </Btn>
    </Modal>
  );
}

// ─── Main Menu Management Page ────────────────────────────────────────────────
export default function MenuManagement() {
  useT();
  const [menu,     setMenu]     = useState({ categories: [], items: [] });
  const [loading,  setLoading]  = useState(true);
  const [catFilter, setCatFilter] = useState('all');
  const [search,   setSearch]   = useState('');
  const [modal,    setModal]    = useState(false);
  const [editItem, setEditItem] = useState(null);

  const load = useCallback(() => {
    getMenu()
      .then(r => setMenu(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = menu.items.filter(item => {
    const matchCat    = catFilter === 'all' || item.category_id === catFilter;
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const openAdd  = ()     => { setEditItem(null); setModal(true); };
  const openEdit = (item) => { setEditItem(item);  setModal(true); };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="🍽 Menu Management"
        subtitle={`${menu.items.length} items across ${menu.categories.length} categories`}
        action={<Btn onClick={openAdd}>+ Add Item</Btn>}
      />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Category pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[{ id: 'all', name: 'All' }, ...menu.categories].map(cat => (
            <button key={cat.id} onClick={() => setCatFilter(cat.id)} style={{
              background: catFilter === cat.id ? T.accent : 'transparent',
              color:      catFilter === cat.id ? '#000' : T.textMid,
              border:     `1px solid ${catFilter === cat.id ? T.accent : T.border}`,
              borderRadius: 24, padding: '6px 16px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}>{cat.name}</button>
          ))}
        </div>
        {/* Search */}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          style={{
            marginLeft: 'auto', background: T.card, border: `1px solid ${T.border}`,
            borderRadius: 10, padding: '8px 14px', color: T.text, fontSize: 13,
            fontFamily: "'Inter', sans-serif", outline: 'none', width: 200,
          }}
        />
      </div>

      {/* Items grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: T.textDim }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🍽</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textMid }}>No items found</div>
          <Btn onClick={openAdd} style={{ marginTop: 16 }}>+ Add First Item</Btn>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map(item => (
            <Card key={item.id + '|' + (item.image_url || '')} hover style={{ padding: 0, overflow: 'hidden' }}>
              {/* Image banner */}
              <div style={{ height: 140, background: T.surface, position: 'relative', overflow: 'hidden' }}>
                {/* Single full-width image with key-based remount on src change */}
                {item.image_url ? (
                  <img
                    key={item.image_url}
                    src={item.image_url.startsWith('http') ? item.image_url : `${IMG_BASE}${item.image_url}`}
                    alt={item.name}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }}
                  />
                ) : null}
                <div style={{ position: 'absolute', inset: 0, display: item.image_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, opacity: 0.3 }}>🍽</div>
                {/* Badges overlay */}
                <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6 }}>
                  {item.is_popular    && <Badge color={T.accent} small>★ Popular</Badge>}
                  {!item.is_available && <Badge color={T.red}    small>Unavailable</Badge>}
                </div>
                {/* Edit button overlay */}
                <button onClick={() => openEdit(item)} style={{
                  position: 'absolute', top: 8, right: 8,
                  background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                }}>✏ Edit</button>
              </div>

              {/* Content */}
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: T.text, flex: 1, marginRight: 8 }}>{item.name}</div>
                  <div style={{ fontWeight: 800, color: T.accent, fontFamily: 'monospace', fontSize: 14, flexShrink: 0 }}>
                    PKR {Number(item.price).toLocaleString()}
                  </div>
                </div>
                {item.description && (
                  <div style={{ fontSize: 12, color: T.textMid, marginBottom: 8, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {item.description}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {item.category_name && <Badge color={T.blue} small>{item.category_name}</Badge>}
                    <Badge color={T.textDim} small>⏱ {item.prep_time_min}min</Badge>
                    {item.cost > 0 && <Badge color={T.textDim} small>Cost: PKR {Number(item.cost).toLocaleString()}</Badge>}
                  </div>
                  {/* Quick image upload button if no image */}
                  {!item.image_url && (
                    <label style={{ cursor: 'pointer' }}>
                      <span style={{ fontSize: 11, color: T.textDim, background: T.surface, border: `1px dashed ${T.border}`, borderRadius: 6, padding: '3px 8px' }}>📷 Add Photo</span>
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={async e => {
                          const file = e.target.files[0];
                          if (!file) return;
                          try {
                            await uploadMenuItemImage(item.id, file);
                            toast.success('Photo added!');
                            load();
                          } catch { toast.error('Upload failed'); }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ItemModal
        open={modal}
        onClose={() => { setModal(false); setEditItem(null); }}
        onSaved={load}
        editItem={editItem}
        categories={menu.categories}
      />
    </div>
  );
}
