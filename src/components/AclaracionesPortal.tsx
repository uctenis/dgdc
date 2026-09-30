import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Megaphone, Paperclip } from 'lucide-react';
import { marcarAclaracionesVistas, subscribeToAclaraciones } from '../services/firestoreService';
import type { AclaracionLicitacion, LicitacionProyecto } from '../types';

const TARJETA = { background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.25)' };
const fechaDia = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL');

const aclaracionesDemo = (): AclaracionLicitacion[] => [{
  id: 'demo-a1', numero: 1, titulo: 'Reemplazo de plano de cubierta (lámina A-02)', fecha: new Date().toISOString(), publicadaPor: 'UCT',
  texto: 'Se reemplaza la lámina A-02 por la versión B: cambia la pendiente de la cubierta sur de 10% a 15%. Las cantidades del formato de presupuesto no cambian.',
}];

/**
 * Aclaraciones y modificaciones a las bases en el portal del proveedor. Al verlas queda registrado (para la UCT)
 * que el proveedor las conoció; las no vistas se marcan como nuevas.
 */
export function AclaracionesPortal({ licitacion, proveedorId, soloLectura, demo }: {
  licitacion: LicitacionProyecto;
  proveedorId: string;
  soloLectura?: boolean;
  demo?: boolean;
}) {
  const [aclaraciones, setAclaraciones] = useState<AclaracionLicitacion[]>(() => (demo ? aclaracionesDemo() : []));
  // Las marcadas como nuevas al abrir el portal siguen destacadas durante esta visita aunque ya queden registradas.
  const [nuevas, setNuevas] = useState<Set<string>>(() => new Set(demo ? ['demo-a1'] : []));
  const registradas = useRef(new Set<string>());

  useEffect(() => {
    if (demo) return;
    return subscribeToAclaraciones(licitacion.id, setAclaraciones);
  }, [licitacion.id, demo]);

  useEffect(() => {
    if (demo || soloLectura || !proveedorId) return;
    const pendientes = aclaraciones.map(a => a.id).filter(id => !registradas.current.has(id));
    if (!pendientes.length) return;
    pendientes.forEach(id => registradas.current.add(id));
    setNuevas(prev => new Set([...prev, ...pendientes]));
    marcarAclaracionesVistas(licitacion.id, proveedorId, pendientes).catch(err => console.warn('No se pudo registrar la lectura de aclaraciones:', err));
  }, [aclaraciones, demo, soloLectura, proveedorId, licitacion.id]);

  if (!aclaraciones.length) return null;

  return (
    <div className="rounded-2xl p-5 space-y-3" style={TARJETA}>
      <h3 className="text-sm font-bold text-amber-200 flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-amber-300" />
        Aclaraciones y modificaciones a las bases ({aclaraciones.length})
      </h3>
      <p className="text-[11px] text-amber-100/80">Forman parte de las bases de esta licitación. Revíselas antes de presentar su oferta.</p>
      <div className="space-y-2.5">
        {[...aclaraciones].reverse().map(a => (
          <div key={a.id} className="rounded-xl bg-white/5 border border-white/10 p-3.5 space-y-1.5">
            <p className="text-[10px] font-bold uppercase text-amber-300 flex items-center gap-2">
              Aclaración N° {a.numero} · {fechaDia(a.fecha)}
              {nuevas.has(a.id) && !soloLectura && <span className="px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 normal-case">Nueva</span>}
            </p>
            <p className="text-xs font-bold text-white">{a.titulo}</p>
            <p className="text-xs text-slate-200 whitespace-pre-line">{a.texto}</p>
            {a.cambioCierre && (
              <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
                <CalendarClock className="w-3.5 h-3.5" />
                Nueva fecha de cierre: {fechaDia(a.cambioCierre.fechaNueva)}{a.cambioCierre.horaNueva ? `, ${a.cambioCierre.horaNueva} hrs` : ''} (antes {fechaDia(a.cambioCierre.fechaAnterior)})
              </p>
            )}
            {a.archivo && (
              <a href={a.archivo.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">
                <Paperclip className="w-3.5 h-3.5" /> {a.archivo.nombre}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
