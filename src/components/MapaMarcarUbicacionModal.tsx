import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, MapPin, Search, Loader2, Check } from 'lucide-react';
import { leerCoordenadas } from '../data/campusData';

export interface PuntoMapa { lat: number; lng: number }

interface Props {
  /** Qué se está marcando: "CSF12 · Edificio Teresa Durán". */
  titulo: string;
  punto?: PuntoMapa;
  /** Otros edificios del campus ya marcados: se muestran de referencia y sirven para centrar el mapa. */
  otros?: { etiqueta: string; lat: number; lng: number }[];
  /** Dirección del campus, para ubicar el mapa cuando aún no hay ningún punto marcado. */
  direccion: string;
  onGuardar: (punto: PuntoMapa | undefined) => void;
  onClose: () => void;
}

const CENTRO_TEMUCO: PuntoMapa = { lat: -38.7397, lng: -72.5901 };
const redondear = (n: number) => Math.round(n * 1e6) / 1e6;

const chincheta = L.divIcon({
  className: '',
  html: '<svg width="34" height="44" viewBox="0 0 34 44"><path d="M17 1C8.2 1 1 8.2 1 17c0 11.5 16 26 16 26s16-14.500 16-26C33 8.200 25.800 1 17 1z" fill="#e11d48" stroke="#fff" stroke-width="2"/><circle cx="17" cy="17" r="6" fill="#fff"/></svg>',
  iconSize: [34, 44],
  iconAnchor: [17, 43],
});

/** Busca una dirección en OpenStreetMap (Nominatim) y devuelve su punto, o null si no la encuentra. */
async function buscarDireccion(texto: string): Promise<PuntoMapa | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cl&q=${encodeURIComponent(texto)}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return null;
  const [primero] = (await resp.json()) as { lat: string; lon: string }[];
  return primero ? { lat: Number(primero.lat), lng: Number(primero.lon) } : null;
}

/** Mapa satelital para marcar un edificio con un clic: la chincheta queda donde se hace clic y se puede arrastrar. */
export function MapaMarcarUbicacionModal({ titulo, punto: puntoInicial, otros = [], direccion, onGuardar, onClose }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const marcador = useRef<L.Marker | null>(null);
  const [punto, setPunto] = useState<PuntoMapa | undefined>(puntoInicial);
  const [busqueda, setBusqueda] = useState(direccion);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState('');

  const ponerChincheta = (p: PuntoMapa, centrar = false) => {
    const m = mapa.current;
    if (!m) return;
    const destino = { lat: redondear(p.lat), lng: redondear(p.lng) };
    if (marcador.current) {
      marcador.current.setLatLng(destino);
    } else {
      marcador.current = L.marker(destino, { icon: chincheta, draggable: true }).addTo(m);
      marcador.current.on('dragend', () => {
        const ll = marcador.current!.getLatLng();
        setPunto({ lat: redondear(ll.lat), lng: redondear(ll.lng) });
      });
    }
    setPunto(destino);
    if (centrar) m.setView(destino, Math.max(m.getZoom(), 18));
  };

  const irA = async (texto: string, avisar: boolean) => {
    const coordenadas = leerCoordenadas(texto);
    if (coordenadas) { ponerChincheta(coordenadas, true); setAviso(''); return; }
    if (!texto.trim()) return;
    setBuscando(true);
    setAviso('');
    try {
      const encontrado = await buscarDireccion(texto);
      if (encontrado) mapa.current?.setView(encontrado, 17);
      else if (avisar) setAviso('No se encontró esa dirección. Pruebe con calle y ciudad, o mueva el mapa a mano.');
    } catch {
      if (avisar) setAviso('No se pudo buscar la dirección. Mueva el mapa a mano hasta el campus.');
    } finally {
      setBuscando(false);
    }
  };

  useEffect(() => {
    if (!contenedor.current) return;
    const centro = puntoInicial || otros[0] || CENTRO_TEMUCO;
    const m = L.map(contenedor.current, { center: centro, zoom: puntoInicial ? 19 : otros.length ? 18 : 13, maxZoom: 20 });
    mapa.current = m;
    const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 20, maxNativeZoom: 19, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
    }).addTo(m);
    const calles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 20, maxNativeZoom: 19, attribution: '© OpenStreetMap',
    });
    L.control.layers({ 'Satélite': satelite, 'Calles': calles }, undefined, { collapsed: false }).addTo(m);

    otros.forEach(o => {
      L.circleMarker(o, { radius: 6, color: '#fff', weight: 2, fillColor: '#0ea5e9', fillOpacity: 1 })
        .addTo(m)
        .bindTooltip(o.etiqueta, { permanent: true, direction: 'top', offset: [0, -6] });
    });
    if (puntoInicial) ponerChincheta(puntoInicial);
    m.on('click', e => ponerChincheta(e.latlng));
    // Sin ningún punto de referencia, se lleva el mapa a la dirección del campus.
    if (!puntoInicial && !otros.length && direccion.trim()) irA(direccion, false);
    // El modal aparece con una transición: el mapa debe volver a medir su tamaño.
    const medir = setTimeout(() => m.invalidateSize(), 150);
    return () => {
      clearTimeout(medir);
      m.remove();
      mapa.current = null;
      marcador.current = null;
    };
    // El mapa se crea una sola vez al abrir el modal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quitar = () => {
    marcador.current?.remove();
    marcador.current = null;
    setPunto(undefined);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl flex flex-col max-h-[94vh] overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase text-rose-700 flex items-center gap-1"><MapPin className="w-3 h-3" /> Marcar ubicación</span>
            <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-2.5 border-b shrink-0 space-y-1.5 text-xs">
          <p className="text-slate-600"><strong>Haga clic sobre el edificio</strong> para poner la chincheta. Puede arrastrarla para afinar el punto.</p>
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); irA(busqueda, true); }}>
            <input
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar una dirección, o pegar coordenadas de Google Maps"
              className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500"
            />
            <button type="submit" disabled={buscando} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-1.5">
              {buscando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Ir
            </button>
          </form>
          {aviso && <p className="text-amber-700">{aviso}</p>}
        </div>

        <div ref={contenedor} className="flex-1 min-h-[380px] cursor-crosshair" />

        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t shrink-0 text-xs">
          <span className={punto ? 'font-bold text-emerald-700' : 'text-slate-400'}>
            {punto ? `Punto marcado: ${punto.lat}, ${punto.lng}` : 'Aún no hay un punto marcado.'}
          </span>
          <div className="flex items-center gap-2">
            {punto && <button type="button" onClick={quitar} className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg font-medium">Quitar punto</button>}
            <button type="button" onClick={onClose} className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancelar</button>
            <button
              type="button"
              onClick={() => { onGuardar(punto); onClose(); }}
              disabled={!punto && !puntoInicial}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-lg flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" /> Usar este punto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
