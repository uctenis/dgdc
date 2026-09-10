import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

interface PremiumDatePickerProps {
  value?: string; // 'YYYY-MM-DD'
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  icon?: boolean;
  allowClear?: boolean;
  min?: string;
  max?: string;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_CORTOS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function parseFecha(value?: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatearISO(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatearDisplay(value?: string): string {
  const fecha = parseFecha(value);
  if (!fecha) return '';
  return `${fecha.getDate()} ${MESES[fecha.getMonth()].slice(0, 3).toLowerCase()} ${fecha.getFullYear()}`;
}

function esMismoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function PremiumDatePicker({ value, onChange, className, placeholder = 'Seleccionar fecha', disabled, id, icon = true, allowClear = true, min, max }: PremiumDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [posicion, setPosicion] = useState<{ top: number; left: number; width: number } | null>(null);
  const seleccionada = parseFecha(value);
  const minFecha = parseFecha(min);
  const maxFecha = parseFecha(max);
  const [mesVisible, setMesVisible] = useState(() => seleccionada || new Date());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setMesVisible(seleccionada || new Date());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reposicionar = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelAlto = 360;
    const panelAncho = 296;
    let top = rect.bottom + 8;
    if (top + panelAlto > window.innerHeight) top = Math.max(8, rect.top - panelAlto - 8);
    let left = rect.left;
    if (left + panelAncho > window.innerWidth) left = Math.max(8, window.innerWidth - panelAncho - 8);
    setPosicion({ top, left, width: rect.width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    reposicionar();
    const onScroll = () => reposicionar();
    const onResize = () => reposicionar();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const seleccionarDia = (y: number, m: number, d: number) => {
    const candidata = new Date(y, m, d);
    if (minFecha && candidata < minFecha) return;
    if (maxFecha && candidata > maxFecha) return;
    onChange(formatearISO(y, m, d));
    setOpen(false);
  };

  const year = mesVisible.getFullYear();
  const month = mesVisible.getMonth();
  const primerDiaSemana = (new Date(year, month, 1).getDay() + 6) % 7;
  const diasEnMes = new Date(year, month + 1, 0).getDate();
  const diasMesAnterior = new Date(year, month, 0).getDate();
  const hoy = new Date();

  const celdas: { dia: number; mesOffset: -1 | 0 | 1 }[] = [];
  for (let i = primerDiaSemana - 1; i >= 0; i--) celdas.push({ dia: diasMesAnterior - i, mesOffset: -1 });
  for (let d = 1; d <= diasEnMes; d++) celdas.push({ dia: d, mesOffset: 0 });
  while (celdas.length < 42) celdas.push({ dia: celdas.length - primerDiaSemana - diasEnMes + 1, mesOffset: 1 });

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={className || 'flex items-center gap-2 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-left disabled:opacity-60 disabled:cursor-not-allowed'}
      >
        {icon && <CalendarDays className="w-3.5 h-3.5 shrink-0 opacity-50" />}
        <span className={value ? '' : 'opacity-50'}>{value ? formatearDisplay(value) : placeholder}</span>
      </button>

      {open && posicion && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: posicion.top, left: posicion.left, width: 296, zIndex: 2147483000 }}
          className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-2xl ring-1 ring-black/5"
        >
          <div className="flex items-center justify-between mb-2.5">
            <button type="button" onClick={() => setMesVisible(new Date(year, month - 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-black text-slate-800 uppercase tracking-wide">{MESES[month]} {year}</span>
            <button type="button" onClick={() => setMesVisible(new Date(year, month + 1, 1))} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DIAS_CORTOS.map((d, i) => (
              <span key={i} className="h-6 flex items-center justify-center text-[9px] font-bold uppercase text-slate-400">{d}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {celdas.map((celda, i) => {
              const y = celda.mesOffset === -1 ? (month === 0 ? year - 1 : year) : celda.mesOffset === 1 ? (month === 11 ? year + 1 : year) : year;
              const m = celda.mesOffset === -1 ? (month === 0 ? 11 : month - 1) : celda.mesOffset === 1 ? (month === 11 ? 0 : month + 1) : month;
              const fechaCelda = new Date(y, m, celda.dia);
              const esSeleccionada = seleccionada && esMismoDia(seleccionada, fechaCelda);
              const esHoy = esMismoDia(hoy, fechaCelda);
              const deshabilitada = (minFecha && fechaCelda < minFecha) || (maxFecha && fechaCelda > maxFecha);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={Boolean(deshabilitada)}
                  onClick={() => seleccionarDia(y, m, celda.dia)}
                  className={[
                    'h-8 w-8 flex items-center justify-center rounded-full text-[11px] font-bold transition',
                    celda.mesOffset !== 0 ? 'text-slate-300' : 'text-slate-700',
                    deshabilitada ? 'opacity-30 cursor-not-allowed' : 'hover:bg-sky-50',
                    esSeleccionada ? '!bg-sky-600 !text-white shadow-sm' : '',
                    esHoy && !esSeleccionada ? 'ring-1 ring-sky-400 text-sky-700' : '',
                  ].join(' ')}
                >
                  {celda.dia}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
            <button type="button" onClick={() => { const t = new Date(); seleccionarDia(t.getFullYear(), t.getMonth(), t.getDate()); }} className="text-[11px] font-bold text-sky-700 hover:text-sky-900 px-2 py-1 rounded-lg hover:bg-sky-50">
              Hoy
            </button>
            {allowClear && value && (
              <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50">
                <X className="w-3 h-3" /> Limpiar
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
