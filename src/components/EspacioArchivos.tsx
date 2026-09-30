import { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { espacioUsadoArchivos } from '../services/archivosService';

/** La base gratuita de Firestore tiene 1 GB; cada archivo ocupa ~37% más por guardarse en base64. */
const CAPACIDAD_BYTES = 1024 ** 3;
const FACTOR_BASE64 = 1.37;

/** Cuánto espacio de la base gratuita usan los archivos guardados en el sistema. */
export function EspacioArchivos() {
  const [uso, setUso] = useState<{ bytes: number; cantidad: number } | null>(null);
  useEffect(() => { espacioUsadoArchivos().then(setUso).catch(() => setUso(null)); }, []);
  if (!uso) return null;
  const ocupado = uso.bytes * FACTOR_BASE64;
  const pct = Math.min(100, Math.round((ocupado / CAPACIDAD_BYTES) * 1000) / 10);
  const mb = (b: number) => `${(b / 1048576).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB`;
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><HardDrive className="w-4 h-4 text-slate-600" /> Espacio de archivos</h3>
        <span className={`text-xs font-bold ${pct >= 80 ? 'text-red-700' : pct >= 60 ? 'text-amber-700' : 'text-slate-600'}`}>
          {mb(ocupado)} de 1.024 MB ({pct.toLocaleString('es-CL')}%) · {uso.cantidad} archivos
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${pct}% usado`}>
        <div className={`h-full rounded-full ${pct >= 80 ? 'bg-red-500' : pct >= 60 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <p className="text-[10px] text-slate-500">Los archivos se guardan en la base de datos gratuita de Firebase (1 GB en total, sin costo). Sobre el 80% conviene archivar documentos antiguos en Drive.</p>
    </section>
  );
}
