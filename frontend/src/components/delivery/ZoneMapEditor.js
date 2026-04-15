import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, Circle, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';
import {
  getDeliveryZones, updateDeliveryZone, createDeliveryZone,
  getDeliveryAreas,
  getRestaurantLocation, saveRestaurantLocation,
} from '../../services/api';

// Fix Leaflet default icon paths (broken by webpack)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ZONE_COLORS = ['#F5A623', '#3498DB', '#2ECC71', '#9B59B6', '#E74C3C', '#1ABC9C', '#F39C12', '#2980B9'];

// ── Map click handler ──────────────────────────────────────────────────────────
function MapInteraction({ drawMode, onPoint, onLocationPick }) {
  useMapEvents({
    click(e) {
      if (drawMode === 'zone')     onPoint([e.latlng.lat, e.latlng.lng]);
      if (drawMode === 'location') onLocationPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

// ── Cursor style when in draw modes ────────────────────────────────────────────
function MapCursor({ drawMode }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (drawMode === 'zone')     el.style.cursor = 'crosshair';
    else if (drawMode === 'location') el.style.cursor = 'cell';
    else                         el.style.cursor = '';
    return () => { el.style.cursor = ''; };
  }, [drawMode, map]);
  return null;
}

const EMPTY_FORM = { name: '', customer_fee: '', rider_payout: '', sort_order: 0 };

export default function ZoneMapEditor() {
  const { theme: T } = useTheme();
  const [zones,       setZones]       = useState([]);
  const [areas,       setAreas]       = useState([]);
  const [restLoc,     setRestLoc]     = useState(null);   // [lat, lng]
  const [loading,     setLoading]     = useState(true);
  const [selectedZone, setSelectedZone] = useState(null); // zone to redraw
  const [drawMode,    setDrawMode]    = useState(null);   // null | 'zone' | 'location'
  const [drawPoints,  setDrawPoints]  = useState([]);     // [[lat,lng],…]
  const [showForm,    setShowForm]    = useState(false);  // name form after drawing new zone
  const [zoneForm,    setZoneForm]    = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [center,      setCenter]      = useState([24.8607, 67.0011]); // Karachi default

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [z, a, loc] = await Promise.all([
        getDeliveryZones(),
        getDeliveryAreas(),
        getRestaurantLocation(),
      ]);
      setZones(z.data);
      setAreas(a.data);
      if (loc.data.lat && loc.data.lng) {
        const pos = [parseFloat(loc.data.lat), parseFloat(loc.data.lng)];
        setRestLoc(pos);
        setCenter(pos);
      }
    } catch { toast.error('Failed to load map data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const toGeoJSON = (points) => {
    const ring = [...points.map(([lat, lng]) => [lng, lat]), [points[0][1], points[0][0]]];
    return { type: 'Polygon', coordinates: [ring] };
  };

  const cancel = () => {
    setDrawMode(null); setDrawPoints([]); setShowForm(false);
    setZoneForm(EMPTY_FORM); setSelectedZone(null);
  };

  // ── Map click handlers ───────────────────────────────────────────────────────
  const handlePoint = (pt) => setDrawPoints(prev => [...prev, pt]);

  const handleLocationPick = async (pt) => {
    setDrawMode(null);
    setSaving(true);
    try {
      await saveRestaurantLocation({ lat: pt[0], lng: pt[1] });
      setRestLoc(pt);
      setCenter(pt);
      toast.success(`Location saved: ${pt[0].toFixed(5)}, ${pt[1].toFixed(5)}`);
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  // ── Save polygon to existing zone ────────────────────────────────────────────
  const saveToExistingZone = async () => {
    if (!selectedZone || drawPoints.length < 3) return;
    setSaving(true);
    try {
      await updateDeliveryZone(selectedZone.id, { ...selectedZone, polygon: toGeoJSON(drawPoints) });
      toast.success(`Polygon saved for "${selectedZone.name}"`);
      cancel(); load();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  // ── Create new zone with polygon ─────────────────────────────────────────────
  const saveNewZone = async () => {
    if (!zoneForm.name.trim() || zoneForm.customer_fee === '') return toast.error('Name and customer fee required');
    if (drawPoints.length < 3) return toast.error('Need at least 3 points');
    setSaving(true);
    try {
      await createDeliveryZone({
        name: zoneForm.name.trim(),
        customer_fee: zoneForm.customer_fee,
        rider_payout: zoneForm.rider_payout || 0,
        sort_order: zoneForm.sort_order || 0,
        min_km: 0,
        polygon: toGeoJSON(drawPoints),
        is_active: true,
      });
      toast.success(`Zone "${zoneForm.name}" created`);
      cancel(); load();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  // ── Clear polygon from zone ───────────────────────────────────────────────────
  const clearPolygon = async (zone) => {
    if (!window.confirm(`Clear polygon from "${zone.name}"?`)) return;
    try {
      await updateDeliveryZone(zone.id, { ...zone, polygon: null });
      toast.success('Polygon cleared');
      load();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading map…</div>;

  const isDrawing       = drawMode === 'zone';
  const isPickingLoc    = drawMode === 'location';
  const canFinish       = isDrawing && drawPoints.length >= 3;

  const inp = (placeholder, key, type = 'text') => (
    <input
      type={type}
      placeholder={placeholder}
      value={zoneForm[key]}
      onChange={e => setZoneForm(f => ({ ...f, [key]: e.target.value }))}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '7px 10px',
        borderRadius: 8, border: `1px solid ${T.border}`,
        background: T.card, color: T.text, fontSize: 12, outline: 'none',
      }}
    />
  );

  return (
    <div>
      {/* ── Mode banners ── */}
      {isDrawing && (
        <div style={{ background: '#F5A62322', border: '1px solid #F5A623', borderRadius: 8, padding: '8px 14px', marginBottom: 10, fontSize: 12, color: '#F5A623', fontWeight: 700 }}>
          ✏ Drawing mode — click map to add points &nbsp;·&nbsp; {drawPoints.length} point{drawPoints.length !== 1 ? 's' : ''} added
          {drawPoints.length < 3 && ` · need ${3 - drawPoints.length} more`}
        </div>
      )}
      {isPickingLoc && (
        <div style={{ background: '#3498DB22', border: '1px solid #3498DB', borderRadius: 8, padding: '8px 14px', marginBottom: 10, fontSize: 12, color: '#3498DB', fontWeight: 700 }}>
          📍 Location pick mode — click on the map to set restaurant origin
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <div style={{ flex: '0 0 270px' }}>

          {/* Restaurant Location card */}
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>🏪 Restaurant Location</div>
            {restLoc ? (
              <div style={{ fontSize: 12, color: T.textMid, marginBottom: 10, fontFamily: 'monospace' }}>
                {restLoc[0].toFixed(5)}, {restLoc[1].toFixed(5)}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10 }}>Not set — mark on map to enable distance-based zones</div>
            )}
            {!isDrawing && !isPickingLoc && (
              <button
                onClick={() => setDrawMode('location')}
                disabled={saving}
                style={{ width: '100%', padding: '7px', borderRadius: 8, background: '#3498DB', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
              >
                📍 {restLoc ? 'Re-mark on Map' : 'Mark on Map'}
              </button>
            )}
            {isPickingLoc && (
              <button onClick={() => setDrawMode(null)} style={{ width: '100%', padding: '7px', borderRadius: 8, background: T.surface, color: T.text, border: `1px solid ${T.border}`, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Cancel
              </button>
            )}
          </div>

          {/* Zones list */}
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Zones</div>
          {zones.length === 0 && (
            <div style={{ fontSize: 12, color: T.textDim, marginBottom: 10 }}>No zones yet. Draw one below.</div>
          )}
          {zones.map((z, i) => {
            const color = ZONE_COLORS[i % ZONE_COLORS.length];
            const isSelected = selectedZone?.id === z.id;
            return (
              <div
                key={z.id}
                onClick={() => { if (!isDrawing && !isPickingLoc) setSelectedZone(isSelected ? null : z); }}
                style={{
                  padding: '9px 12px', borderRadius: 10, marginBottom: 6,
                  cursor: isDrawing ? 'default' : 'pointer',
                  background: isSelected ? color + '22' : T.surface,
                  border: `2px solid ${isSelected ? color : T.border}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1 }}>{z.name}</span>
                  {z.polygon && !isDrawing && (
                    <button onClick={e => { e.stopPropagation(); clearPolygon(z); }}
                      style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 11, padding: 0 }}>
                      ✕ clear
                    </button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: T.textMid, marginTop: 3 }}>
                  PKR {Number(z.customer_fee).toLocaleString()} · {z.polygon ? '🟢 polygon' : '⚪ no polygon'}
                </div>
              </div>
            );
          })}

          {/* Draw controls */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 8 }}>

            {/* Idle state */}
            {!isDrawing && !isPickingLoc && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => { setDrawMode('zone'); setDrawPoints([]); setShowForm(false); setZoneForm(EMPTY_FORM); setSelectedZone(null); }}
                  style={{ width: '100%', padding: '9px', borderRadius: 8, background: T.accent, color: '#000', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  ✏ Draw New Zone
                </button>
                {selectedZone && (
                  <button
                    onClick={() => { setDrawMode('zone'); setDrawPoints([]); setShowForm(false); }}
                    style={{ width: '100%', padding: '8px', borderRadius: 8, background: T.surface, color: T.text, border: `1px solid ${T.border}`, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                  >
                    ✏ Redraw "{selectedZone.name}"
                  </button>
                )}
              </div>
            )}

            {/* Drawing state */}
            {isDrawing && !showForm && (
              <div>
                <div style={{ fontSize: 11, color: T.textMid, marginBottom: 10, lineHeight: 1.5 }}>
                  Click on the map to add polygon corners.
                  {selectedZone ? ` Redrawing "${selectedZone.name}".` : ' A new zone will be created.'}
                </div>

                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {drawPoints.length > 0 && (
                    <button onClick={() => setDrawPoints(p => p.slice(0, -1))}
                      style={{ flex: 1, padding: '7px', borderRadius: 8, background: T.surface, color: T.text, border: `1px solid ${T.border}`, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                      ↩ Undo
                    </button>
                  )}
                  <button onClick={cancel}
                    style={{ flex: 1, padding: '7px', borderRadius: 8, background: T.card, color: T.textMid, border: `1px solid ${T.border}`, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    Cancel
                  </button>
                </div>

                {/* Finish buttons (only when ≥3 points) */}
                {canFinish && !selectedZone && (
                  <button
                    onClick={() => setShowForm(true)}
                    style={{ width: '100%', padding: '9px', borderRadius: 8, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                  >
                    ✓ Finish — Name This Zone
                  </button>
                )}
                {canFinish && selectedZone && (
                  <button
                    onClick={saveToExistingZone}
                    disabled={saving}
                    style={{ width: '100%', padding: '9px', borderRadius: 8, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
                  >
                    {saving ? '⏳ Saving…' : `✓ Save for "${selectedZone.name}"`}
                  </button>
                )}
              </div>
            )}

            {/* New zone name form (after drawing) */}
            {isDrawing && showForm && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>New Zone — {drawPoints.length} points</div>
                <div style={{ marginBottom: 8 }}>{inp('Zone name *', 'name')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                  {inp('Customer fee *', 'customer_fee', 'number')}
                  {inp('Rider payout', 'rider_payout', 'number')}
                </div>
                <div style={{ marginBottom: 10 }}>{inp('Sort order', 'sort_order', 'number')}</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setShowForm(false)}
                    style={{ flex: 1, padding: '7px', borderRadius: 8, background: T.card, color: T.text, border: `1px solid ${T.border}`, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    ← Back
                  </button>
                  <button
                    onClick={saveNewZone}
                    disabled={saving || !zoneForm.name.trim() || zoneForm.customer_fee === ''}
                    style={{
                      flex: 2, padding: '7px', borderRadius: 8, background: T.accent, color: '#000', border: 'none',
                      fontSize: 12, cursor: 'pointer', fontWeight: 700,
                      opacity: (saving || !zoneForm.name.trim() || zoneForm.customer_fee === '') ? 0.5 : 1,
                    }}>
                    {saving ? '⏳ Saving…' : '💾 Create Zone'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Map ─────────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <MapContainer center={center} zoom={12} style={{ height: 540, borderRadius: 12, border: `1px solid ${T.border}` }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapInteraction drawMode={drawMode} onPoint={handlePoint} onLocationPick={handleLocationPick} />
            <MapCursor drawMode={drawMode} />

            {/* Saved zone polygons */}
            {zones.map((z, i) => {
              if (!z.polygon) return null;
              const positions = z.polygon.coordinates?.[0]?.map(([lng, lat]) => [lat, lng]) || [];
              const color = ZONE_COLORS[i % ZONE_COLORS.length];
              const isSelected = selectedZone?.id === z.id;
              return (
                <Polygon key={z.id} positions={positions}
                  pathOptions={{ color, fillOpacity: isSelected ? 0.3 : 0.15, weight: isSelected ? 3 : 2 }}>
                  <Popup>
                    <strong>{z.name}</strong><br />
                    Customer: PKR {Number(z.customer_fee).toLocaleString()}<br />
                    Rider: PKR {Number(z.rider_payout).toLocaleString()}
                  </Popup>
                </Polygon>
              );
            })}

            {/* In-progress polygon preview */}
            {isDrawing && drawPoints.length >= 2 && (
              <Polygon positions={drawPoints}
                pathOptions={{ color: '#F5A623', fillOpacity: 0.12, dashArray: '6,4', weight: 2 }} />
            )}

            {/* Draw point dots */}
            {isDrawing && drawPoints.map((pt, idx) => (
              <Circle key={idx} center={pt} radius={14}
                pathOptions={{ color: '#F5A623', fillColor: idx === 0 ? '#fff' : '#F5A623', fillOpacity: 0.9, weight: 2 }}>
                <Popup>Point {idx + 1}{idx === 0 ? ' (start)' : ''}</Popup>
              </Circle>
            ))}

            {/* Area pins */}
            {areas.filter(a => a.lat && a.lng).map(a => (
              <Marker key={a.id} position={[parseFloat(a.lat), parseFloat(a.lng)]}>
                <Popup><strong>{a.name}</strong><br />{a.zone_name}</Popup>
              </Marker>
            ))}

            {/* Restaurant origin marker */}
            {restLoc && (
              <Marker position={restLoc} icon={L.divIcon({ html: '🏪', className: '', iconSize: [24, 24] })}>
                <Popup>
                  <strong>Restaurant Origin</strong><br />
                  {restLoc[0].toFixed(5)}, {restLoc[1].toFixed(5)}
                </Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Legend */}
          <div style={{ marginTop: 8, fontSize: 11, color: T.textDim, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span>🏪 Restaurant origin &nbsp; 📍 Areas</span>
            {zones.filter(z => z.polygon).map((z, i) => (
              <span key={z.id} style={{ color: ZONE_COLORS[i % ZONE_COLORS.length] }}>■ {z.name}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
