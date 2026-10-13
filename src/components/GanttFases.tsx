import { useEffect, useRef, useState } from 'react';
import Gantt, { type TareaGantt } from 'frappe-gantt';
// El paquete solo exporta su raíz, así que la hoja de estilos se toma por su ruta en disco.
import '../../node_modules/frappe-gantt/dist/frappe-gantt.css';

export interface FaseGantt {
  fase: string;
  diaInicio: number;
  diaTermino: number;
}

interface Props {
  /** YYYY-MM-DD: día 0 del programa. */
  fechaInicio: string;
  duracionTotalDias: number;
  fases: FaseGantt[];
  /** Se llama al mover o estirar una barra con el mouse. */
  onCambio: (index: number, cambios: { diaInicio: number; diaTermino: number }) => void;
}

type Vista = 'Day' | 'Week' | 'Month';
const VISTAS: { id: Vista; etiqueta: string }[] = [
  { id: 'Day', etiqueta: 'Día' },
  { id: 'Week', etiqueta: 'Semana' },
  { id: 'Month', etiqueta: 'Mes' },
];
// Mismos tonos que las barras de respaldo del panel (sky, violet, amber, emerald, rose, indigo, slate).
const COLORES = ['#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981', '#f43f5e', '#6366f1', '#64748b'];

const DIA_MS = 86_400_000;
const aFecha = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const aISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const masDias = (inicio: Date, dias: number) => { const d = new Date(inicio); d.setDate(d.getDate() + dias); return d; };
const fechaCorta = (d: Date) => d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
// La librería escribe el nombre de la tarea como HTML (etiqueta de la barra y globo): se escapa aquí.
const escaparHTML = (texto: string) => texto.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
/** La librería descarta sin avisar las tareas de más de diez años: los días se acotan antes de dibujar. */
const DIA_MAXIMO = 3650;
const acotar = (n: number, min: number, max: number) => Math.min(Math.max(Number.isFinite(n) ? Math.round(n) : min, min), max);

function aTareas(fases: FaseGantt[], inicio: Date): TareaGantt[] {
  return fases.map((f, i) => {
    // Lo que se escribe en los campos de días llega tecla a tecla: puede venir vacío, negativo o invertido.
    const diaInicio = acotar(f.diaInicio, 0, DIA_MAXIMO - 1);
    const diaTermino = acotar(f.diaTermino, diaInicio + 1, DIA_MAXIMO);
    return {
      id: `fase-${i}`,
      name: escaparHTML(f.fase),
      start: aISO(masDias(inicio, diaInicio)),
      // La librería cuenta el día de término completo: la fase que termina el día N ocupa hasta el día N-1.
      end: aISO(masDias(inicio, diaTermino - 1)),
      progress: 0,
      color: COLORES[i % COLORES.length],
    };
  });
}

/** Carta Gantt con fechas reales de las fases del programa: las barras se mueven y estiran con el mouse. */
export function GanttFases({ fechaInicio, duracionTotalDias, fases, onCambio }: Props) {
  const contenedor = useRef<HTMLDivElement>(null);
  const gantt = useRef<Gantt | null>(null);
  const [vista, setVista] = useState<Vista>(duracionTotalDias > 240 ? 'Month' : duracionTotalDias > 21 ? 'Week' : 'Day');
  const inicio = aFecha(fechaInicio);

  // Los callbacks de la librería quedan fijos al crearla: leen lo último desde estas referencias.
  const actual = useRef({ fases, inicio, duracionTotalDias, onCambio });
  actual.current = { fases, inicio, duracionTotalDias, onCambio };
  // El cambio vino de arrastrar una barra: la librería ya la dibujó, no hay que redibujar.
  const cambioPropio = useRef(false);
  // La barra se soltó fuera del plazo del proyecto y se recortó: hay que redibujarla donde quedó.
  const redibujarAlSoltar = useRef(false);

  const redibujar = () => {
    const g = gantt.current;
    if (!g) return;
    // refresh recalcula el rango de fechas de la carta (mantener la posición con change_view_mode no lo hace
    // y las barras quedarían fuera de la grilla). Si el rango no cambió, se conserva dónde estaba mirando.
    const rangoAntes = `${g.gantt_start?.getTime()}-${g.gantt_end?.getTime()}`;
    const posicion = g.$container?.scrollLeft;
    g.refresh(aTareas(actual.current.fases, actual.current.inicio));
    const rangoDespues = `${g.gantt_start?.getTime()}-${g.gantt_end?.getTime()}`;
    if (rangoAntes === rangoDespues && g.$container && posicion !== undefined) g.$container.scrollLeft = posicion;
  };

  useEffect(() => {
    if (!contenedor.current) return;
    const nodo = contenedor.current;
    gantt.current = new Gantt(nodo, aTareas(actual.current.fases, actual.current.inicio), {
      view_mode: vista,
      language: 'es',
      bar_height: 22,
      padding: 14,
      infinite_padding: false,
      scroll_to: fechaInicio.slice(0, 10),
      today_button: false,
      view_mode_select: false,
      readonly_progress: true,
      popup_on: 'hover',
      popup: ctx => {
        const fin = new Date(ctx.task._end.getTime() - 1000);
        const dias = Math.max(1, Math.round((ctx.task._end.getTime() - ctx.task._start.getTime()) / DIA_MS));
        // El nombre ya viene escapado desde aTareas.
        ctx.set_title(ctx.task.name);
        ctx.set_subtitle('');
        ctx.set_details(`${fechaCorta(ctx.task._start)} → ${fechaCorta(fin)} (${dias} ${dias === 1 ? 'día' : 'días'})`);
      },
      on_date_change: (tarea, desde, hasta) => {
        const { inicio: base, duracionTotalDias: total, onCambio: avisar, fases: actuales } = actual.current;
        const index = Number(tarea.id.replace('fase-', ''));
        // En las vistas Semana y Mes la librería entrega posiciones con fracción de día: la duración se mide
        // de una vez (no restando dos fechas redondeadas por separado) para que mover no cambie el largo.
        const brutoInicio = Math.round((desde.getTime() - base.getTime()) / DIA_MS);
        const duracion = Math.max(1, Math.round((hasta.getTime() + 1000 - desde.getTime()) / DIA_MS));
        const brutoTermino = brutoInicio + duracion;
        const previa = actuales[index];
        // Si la barra se movió entera (misma duración) y salió del plazo, se devuelve al borde sin encogerla.
        const seMovio = Boolean(previa) && previa.diaTermino - previa.diaInicio === duracion && duracion <= total;
        const diaInicio = Math.min(Math.max(0, brutoInicio), Math.max(0, seMovio ? total - duracion : total - 1));
        const diaTermino = seMovio ? diaInicio + duracion : Math.min(Math.max(diaInicio + 1, brutoTermino), Math.max(diaInicio + 1, total));
        if (diaInicio !== brutoInicio || diaTermino !== brutoTermino) redibujarAlSoltar.current = true;
        cambioPropio.current = true;
        avisar(index, { diaInicio, diaTermino });
      },
    });
    const alSoltar = () => {
      if (!redibujarAlSoltar.current) return;
      redibujarAlSoltar.current = false;
      setTimeout(redibujar, 0);
    };
    document.addEventListener('mouseup', alSoltar);
    return () => {
      document.removeEventListener('mouseup', alSoltar);
      gantt.current = null;
      nodo.innerHTML = '';
    };
    // Se crea una sola vez; los cambios posteriores entran por los efectos de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recienCreada = useRef(true);
  useEffect(() => {
    // Al crearla ya quedó dibujada y desplazándose al inicio del proyecto: redibujar ahí cortaría ese desplazamiento.
    if (recienCreada.current) { recienCreada.current = false; return; }
    if (cambioPropio.current) { cambioPropio.current = false; return; }
    redibujar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fases, fechaInicio]);

  const cambiarVista = (v: Vista) => {
    setVista(v);
    gantt.current?.change_view_mode(v, true);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500">Arrastre una barra para moverla, o sus bordes para alargarla o acortarla.</span>
        <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold">
          {VISTAS.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => cambiarVista(v.id)}
              className={`px-2.5 py-1 ${vista === v.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {v.etiqueta}
            </button>
          ))}
        </div>
      </div>
      <div ref={contenedor} className="gantt-fases rounded-lg border border-slate-200 overflow-hidden" />
    </div>
  );
}
