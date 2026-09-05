import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Vite (like most bundlers) breaks Leaflet's default marker icon paths —
// they're built assuming a classic script-tag/CDN setup, not an ESM bundle.
// Re-pointing them at the bundled asset URLs is the standard fix; without
// it every marker renders as a broken image.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Renders a finder-supplied location (NfcLanding.jsx's "Share my current
// location" flow, stored on the `reports` doc — see
// IMPROVEMENT_PLAN.md Round 10 #3 / Round 11 #8). Previously captured and
// then never shown anywhere; this is the owner-facing half of that data.
export default function ReportLocationMap({ location, className = '' }) {
  if (!location?.lat || !location?.lng) return null;
  const center = [location.lat, location.lng];

  return (
    <div className={`overflow-hidden rounded-2xl shadow-neu-pressed-sm ${className}`}>
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom={false}
        style={{ height: '200px', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {location.accuracy > 0 && (
          <Circle center={center} radius={location.accuracy} pathOptions={{ color: '#9333ea', fillOpacity: 0.1 }} />
        )}
        <Marker position={center}>
          <Popup>
            Reported near here
            {location.accuracy > 0 && <> — accurate to ~{Math.round(location.accuracy)}m</>}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
