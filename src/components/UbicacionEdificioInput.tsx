import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { urlGoogleMaps } from '../data/campusData';
import { MapaMarcarUbicacionModal } from './MapaMarcarUbicacionModal';

interface Props {
  /** Qué se marca: "CSF12 · Edificio Teresa Durán". */
  titulo: string;
  lat?: number;
  lng?: number;
  /** Dirección del campus, para ubicar el mapa. */
  direccion: string;
  /** Otros edificios del campus ya marcados, como referencia en el mapa. */
  otros?: { etiqueta: string; lat: number; lng: number }[];
  onCambio: (punto: { lat?: number; lng?: number }) => void;
}

/** Celda para marcar un edificio o zona en el mapa: abre el mapa satelital y la chincheta se pone con un clic. */
export function UbicacionEdificioInput({ titulo, lat, lng, direccion, otros, onCambio }: Props) {
  const [abierto, setAbierto] = useState(false);
  const marcado = lat != null && lng != null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`flex items-center gap-1 px-2 py-1 rounded-md border font-bold whitespace-nowrap ${
          marcado ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100' : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
        }`}
      >
        <MapPin className="w-3.5 h-3.5" /> {marcado ? 'Marcado · cambiar' : 'Marcar en el mapa'}
      </button>
      {marcado && (
        <a href={urlGoogleMaps(lat, lng)} target="_blank" rel="noreferrer" className="text-[9px] text-sky-700 underline whitespace-nowrap">
          {lat}, {lng} · ver en Google Maps
        </a>
      )}
      {abierto && (
        <MapaMarcarUbicacionModal
          titulo={titulo}
          punto={marcado ? { lat, lng } : undefined}
          otros={otros}
          direccion={direccion}
          onGuardar={punto => onCambio(punto ? punto : { lat: undefined, lng: undefined })}
          onClose={() => setAbierto(false)}
        />
      )}
    </div>
  );
}
