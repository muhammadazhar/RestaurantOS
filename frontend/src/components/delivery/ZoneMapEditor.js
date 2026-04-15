import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';
import {
  getDeliveryZones, updateDeliveryZone,
  getDeliveryAreas, updateDeliveryArea,
  getRestaurantLocation,
} from '../../services/api';

// Fix Leaflet default icon paths (broken by webpack)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const ZONE_COLORS = ['#F5A623', '#3498DB', '#2ECC71', '#9B59B6', '#E74C3C', '#1ABC9C', '#F39C12', '#2980B9'];

// ── Drawing tool ──────────────────────────────────────────────────────────────
function DrawTool({ drawing, onPoint }) {
  useMapEvents({
    click(e) {
      if (drawing) onPoint([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

export default function ZoneMapEditor() {
  const { theme: T } = useTheme();
  const [zones, setZones] = useState([]);
  const [areas, setAreas] = useState([]);
  const [restLoc, setRestLoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedZone, setSelectedZone] = useState(null);
  const [drawing, setDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState([]); // [[lat,lng], ...]
  const [saving, setSaving] = useState(false);
  const [center, setCenter] = useState([24.8607, 67.0011]); // Karachi default

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
        setRestLoc([parseFloat(loc.data.lat), parseFloat(loc.data.lng)]);
        setCenter([parseFloat(loc.data.lat), parseFloat(loc.data.lng)]);
      }
    } catch (e) { toast.error('Failed to load map data'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePoint = (pt) => {
    setDrawPoints(prev => [...prev, pt]);
  };

  const finishPolygon = async () => {
    if (!selectedZone) return toast.error('Select a zone first');
    if (drawPoints.length < 3) return toast.error('Draw at least 3 points');
    setSaving(true);
    // GeoJSON polygon: [lng, lat] pairs
    const coords = [...drawPoints.map(([lat, lng]) => [lng, lat]), drawPoints[0].slice().reverse()]; // close ring
    const polygon = { type: 'Polygon', coordinates: [coords] };
    try {
      await updateDeliveryZone(selectedZone.id, { ...selectedZone, polygon });
      toast.success(`Polygon saved for ${selectedZone.name}`);
      setDrawPoints([]);
      setDrawing(false);
      load();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const clearPolygon = async (zone) => {
    if (!window.confirm(`Clear polygon from ${zone.name}?`)) return;
    try {
      await updateDeliveryZone(zone.id, { ...zone, polygon: null });
      toast.success('Polygon cleared');
      load();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
  };

  const cancelDraw = () => { setDrawing(false); setDrawPoints([]); };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading map…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 280px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10 }}>Zones</div>
          {zones.length === 0 && <div style={{ fontSize: 12, color: T.textDim }}>No zones. Create zones first.</div>}
          {zones.map((z, i) => (
            <div
              key={z.id}
              onClick={() => { if (!drawing) setSelectedZone(z); }}
              style={{
                padding: '10px 14px', borderRadius: 10, marginBottom: 6, cursor: 'pointer',
                background: selectedZone?.id === z.id ? ZONE_COLORS[i % ZONE_COLORS.length] + '22' : T.card,
                border: `2px solid ${selectedZone?.id === z.id ? ZONE_COLORS[i % ZONE_COLORS.length] : T.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: ZONE_COLORS[i % ZONE_COLORS.length], flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>{z.name}</span>
                {z.polygon && (
                  <button onClick={(e) => { e.stopPropagation(); clearPolygon(z); }} style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 12 }}>✕ Clear</button>
                )}
              </div>
              <div style={{ fontSize: 11, color: T.textMid, marginTop: 3 }}>
                Customer: PKR {Number(z.customer_fee).toLocaleString()} · {z.polygon ? '🟢 Polygon' : '⚪ No polygon'}
              </div>
            </div>
          ))}

          <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
            {!drawing ? (
              <button
                onClick={() => { if (!selectedZone) return toast.error('Select a zone first'); setDrawing(true); setDrawPoints([]); }}
                style={{ width: '100%', padding: '9px', borderRadius: 8, background: T.accent, color: '#000', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
              >
                ✏ Draw Polygon for "{selectedZone?.name || '...'}"
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 12, color: T.textMid, marginBottom: 10 }}>
                  Click on the map to add polygon points. Points: {drawPoints.length}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={finishPolygon} disabled={saving || drawPoints.length < 3} style={{ flex: 1, padding: '9px', borderRadius: 8, background: '#2ECC71', color: '#fff', border: 'none', fontWeight: 700, cursor: drawPoints.length < 3 ? 'not-allowed' : 'pointer', opacity: drawPoints.length < 3 ? 0.5 : 1 }}>
                    {saving ? '⏳' : '✓ Save'}
                  </button>
                  <button onClick={cancelDraw} style={{ flex: 1, padding: '9px', borderRadius: 8, background: T.card, color: T.text, border: `1px solid ${T.border}`, fontWeight: 700, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 300 }}>
          {drawing && (
            <div style={{ background: '#F5A62322', border: '1px solid #F5A623', borderRadius: 8, padding: '8px 14px', marginBottom: 10, fontSize: 12, color: '#F5A623', fontWeight: 700 }}>
              ✏ Drawing mode — click on the map to add points ({drawPoints.length} so far)
            </div>
          )}
          <MapContainer
            center={center}
            zoom={12}
            style={{ height: 500, borderRadius: 12, border: `1px solid ${T.border}` }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <DrawTool drawing={drawing} onPoint={handlePoint} />

            {/* Existing zone polygons */}
            {zones.map((z, i) => {
              if (!z.polygon) return null;
              const coords = z.polygon.coordinates?.[0]?.map(([lng, lat]) => [lat, lng]) || [];
              return (
                <Polygon
                  key={z.id}
                  positions={coords}
                  pathOptions={{ color: ZONE_COLORS[i % ZONE_COLORS.length], fillOpacity: 0.2, weight: 2 }}
                >
                  <Popup><strong>{z.name}</strong><br />Customer: PKR {Number(z.customer_fee).toLocaleString()}<br />Rider: PKR {Number(z.rider_payout).toLocaleString()}</Popup>
                </Polygon>
              );
            })}

            {/* Live draw preview */}
            {drawPoints.length >= 2 && (
              <Polygon
                positions={drawPoints}
                pathOptions={{ color: '#F5A623', fillOpacity: 0.15, dashArray: '6,4', weight: 2 }}
              />
            )}

            {/* Area pins */}
            {areas.filter(a => a.lat && a.lng).map(a => (
              <Marker key={a.id} position={[parseFloat(a.lat), parseFloat(a.lng)]}>
                <Popup><strong>{a.name}</strong><br />{a.zone_name}</Popup>
              </Marker>
            ))}

            {/* Restaurant marker */}
            {restLoc && (
              <Marker position={restLoc} icon={L.divIcon({ html: '🏪', className: '', iconSize: [24, 24] })}>
                <Popup>Restaurant Origin</Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      </div>
    </div>
  );
}
