import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2, ListChecks, AlertTriangle, Download, Calculator, FileSpreadsheet, Upload, Pencil, Lock } from 'lucide-react';
import { FASES_ITEMIZADO } from '../types';
import type { ItemItemizadoProyecto, ProyectoMaestro, ConfiguracionFirmas } from '../types';
import { updateProyectoMaestro } from '../services/firestoreService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { sugerirItemizadoConIA, isAIConfigured, type ItemItemizadoPrecisoSugeridoIA, mensajeErrorIA } from '../services/aiService';
import { formatearEnteroConMiles, desformatearEntero, formatearNumeroConMiles, desformatearNumero } from '../utils/rutUtils';
import { agruparPorFase, renumerarPartidasCorrelativas, SIN_FASE } from '../utils/itemizadoOrganizer';
import { generarItemizadoExcel } from '../services/itemizadoExporter';
import { parsePresupuestoExcel, type ParsedPresupuestoImportado } from '../utils/excelParser';
import { parsePresupuestoPdf } from '../utils/pdfParser';
import { PresupuestoPrecisoIAModal } from './PresupuestoPrecisoIAModal';

const UNIDADES_CONSTRUCCION = ['m2', 'm3', 'ml', 'm', 'un', 'gl', 'kg', 'ton', 'hh', 'día', 'jornada', 'litro', 'caja', 'saco', 'rollo'];

interface Props {
  proyecto: ProyectoMaestro;
  configFirmas?: ConfiguracionFirmas;
  /** Si se entrega, reemplaza la actualización por defecto (solo proyecto maestro) para propagar el monto a todo el proyecto. */
  onUsarComoPresupuesto?: (monto: number) => Promise<void>;
}

const nuevaPartida = (indice: number, origen: ItemItemizadoProyecto['origen'] = 'Manual', fase?: string): ItemItemizadoProyecto => ({
  id: `partida-${Date.now()}-${indice}`,
  item: String(indice + 1),
  descripcion: '',
  unidad: 'un',
  cantidad: 0,
  precioUnitario: 0,
  precioTotal: 0,
  origen,
  fase,
});

export function ItemizadoProyectoPanel({ proyecto, configFirmas, onUsarComoPresupuesto }: Props) {
  const [items, setItems] = useState<ItemItemizadoProyecto[]>(proyecto.itemizado || []);
  const [guardando, setGuardando] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [errorIA, setErrorIA] = useState<string | null>(null);
  const [hayCambios, setHayCambios] = useState(false);
  const [aplicandoPresupuesto, setAplicandoPresupuesto] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [mostrarPresupuestoPreciso, setMostrarPresupuestoPreciso] = useState(false);
  const [cargandoExcel, setCargandoExcel] = useState(false);
  const [avisoImportacion, setAvisoImportacion] = useState<{ tipo: 'exito' | 'error'; mensajes: string[] } | null>(null);
  const inputExcelRef = useRef<HTMLInputElement>(null);
  // Gastos Generales y Utilidad, en % — mismo esquema que un presupuesto de construcción típico
  // (ver el cálculo en cascada más abajo). En 0 no afectan nada (Presupuesto = partidas + IVA).
  const [gastosGeneralesPct, setGastosGeneralesPct] = useState<number>(proyecto.itemizadoMarkup?.gastosGeneralesPct || 0);
  const [utilidadPct, setUtilidadPct] = useState<number>(proyecto.itemizadoMarkup?.utilidadPct || 0);
  // Mientras se escribe una Cantidad con decimales, se guarda el texto crudo tal cual se tipea
  // (con la coma al final incluida) — si se reformateara desde el número en cada tecla, la coma
  // decimal desaparecería apenas se escribe (12, -> 12) y nunca se podría ingresar el decimal.
  const [textoCantidad, setTextoCantidad] = useState<Record<string, string>>({});
  const [errorAutoguardado, setErrorAutoguardado] = useState(false);
  // Modo lectura por defecto para evitar modificaciones accidentales: la tabla se ve bloqueada y hay
  // que presionar "Editar presupuesto" para cambiar algo. Un itemizado vacío se abre ya en edición.
  const [modoEdicion, setModoEdicion] = useState<boolean>(() => (proyecto.itemizado || []).length === 0);
  useEffect(() => {
    if (items.length === 0) setModoEdicion(true);
  }, [items.length]);

  // Autoguardado: antes, cargar un Excel, borrar o editar partidas quedaba solo en pantalla hasta
  // apretar "Guardar Itemizado" (al final de la lista) — al recargar o salir de la ficha se perdía
  // todo sin aviso. Ahora cada cambio se escribe en Firestore 1,5 s después de la última edición.
  // Se guarda tal cual (sin renumerar, para no mover los ítems mientras se tipea); el botón
  // "Guardar Itemizado" sigue disponible para renumerar de forma correlativa.
  // Proyecto al que pertenecen los `items` en pantalla: al cambiar de proyecto, este efecto corre
  // antes de que se recarguen los items, y no debe guardar las partidas del anterior en el nuevo.
  const idCargadoRef = useRef(proyecto.id);
  const pendienteRef = useRef<{ id: string; itemizado: ItemItemizadoProyecto[]; markup: { gastosGeneralesPct: number; utilidadPct: number } } | null>(null);
  const guardarPendienteAhora = () => {
    const pendiente = pendienteRef.current;
    if (!pendiente) return;
    pendienteRef.current = null;
    updateProyectoMaestro(pendiente.id, { itemizado: pendiente.itemizado, itemizadoMarkup: pendiente.markup })
      .catch(err => console.error('Error guardando itemizado pendiente:', err));
  };

  useEffect(() => {
    if (idCargadoRef.current !== proyecto.id) return;
    if (!hayCambios) {
      pendienteRef.current = null;
      return;
    }
    const datos = { id: proyecto.id, itemizado: items, markup: { gastosGeneralesPct, utilidadPct } };
    pendienteRef.current = datos;
    const t = setTimeout(async () => {
      if (pendienteRef.current !== datos) return;
      pendienteRef.current = null;
      try {
        await updateProyectoMaestro(datos.id, { itemizado: datos.itemizado, itemizadoMarkup: datos.markup });
        setErrorAutoguardado(false);
        // Solo se marca como guardado si no hubo otra edición mientras se escribía.
        if (!pendienteRef.current) setHayCambios(false);
      } catch (err) {
        console.error('Error en autoguardado del itemizado:', err);
        setErrorAutoguardado(true);
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [items, gastosGeneralesPct, utilidadPct, hayCambios, proyecto.id]);

  // Al salir de la ficha (desmontar) se escribe lo pendiente; al cerrar/recargar la pestaña se avisa.
  useEffect(() => {
    const avisarSalida = (e: BeforeUnloadEvent) => {
      if (pendienteRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', avisarSalida);
    return () => {
      window.removeEventListener('beforeunload', avisarSalida);
      guardarPendienteAhora();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recargar solo al cambiar de proyecto — OJO: no agregar `proyecto.itemizado` a las
  // dependencias. La Ficha ahora suscribe el proyecto en vivo, así que ese array cambia de
  // referencia con cualquier edición remota a CUALQUIER campo del proyecto (no solo itemizado);
  // si dependiera de eso, escribir el Presupuesto Estimado desde otra pestaña, por ejemplo,
  // borraría lo que el usuario esté tipeando aquí sin guardar todavía.
  useEffect(() => {
    guardarPendienteAhora();
    idCargadoRef.current = proyecto.id;
    setModoEdicion((proyecto.itemizado || []).length === 0);
    setItems(proyecto.itemizado || []);
    setGastosGeneralesPct(proyecto.itemizadoMarkup?.gastosGeneralesPct || 0);
    setUtilidadPct(proyecto.itemizadoMarkup?.utilidadPct || 0);
    setHayCambios(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyecto.id]);

  // Cálculo en cascada: Costo Directo (suma de partidas) -> Gastos Generales (% del Costo Directo)
  // -> Utilidad (% de Costo Directo + Gastos Generales) -> Total Neto -> IVA -> Total con IVA. Es
  // el mismo esquema de un presupuesto de construcción típico (y el de un Excel cargado como
  // referencia, si trae esos conceptos en su resumen final).
  const costoDirecto = items.reduce((sum, it) => sum + (it.precioTotal || 0), 0);
  const montoGastosGenerales = Math.round(costoDirecto * (gastosGeneralesPct / 100));
  const subtotalConGastosGenerales = costoDirecto + montoGastosGenerales;
  const montoUtilidad = Math.round(subtotalConGastosGenerales * (utilidadPct / 100));
  const subtotalNeto = subtotalConGastosGenerales + montoUtilidad; // Total Neto
  const tasaIva = configFirmas?.parametrosSgc?.tasaIva ?? 19;
  const montoIva = Math.round(subtotalNeto * (tasaIva / 100));
  const totalConIva = subtotalNeto + montoIva;
  const gruposPorFase = useMemo(() => agruparPorFase(items), [items]);

  const actualizarItem = (id: string, cambios: Partial<ItemItemizadoProyecto>) => {
    setItems(actuales => actuales.map(it => {
      if (it.id !== id) return it;
      const actualizado = { ...it, ...cambios };
      // Si el usuario corrige a mano un precio que había llegado como referencial de la IA,
      // deja de estarlo: ya fue validado/reemplazado por un precio real.
      if ('precioUnitario' in cambios && it.precioReferencial) actualizado.precioReferencial = false;
      return { ...actualizado, precioTotal: Math.round((actualizado.cantidad || 0) * (actualizado.precioUnitario || 0)) };
    }));
    setHayCambios(true);
  };

  const agregarPartidasPrecisas = (sugeridas: ItemItemizadoPrecisoSugeridoIA[]) => {
    setItems(actuales => [
      ...actuales,
      ...sugeridas.map((s, i) => ({
        id: `partida-iap-${Date.now()}-${i}`,
        item: s.item || String(actuales.length + i + 1),
        descripcion: s.descripcion,
        unidad: s.unidad || 'un',
        cantidad: s.cantidad,
        precioUnitario: s.precioUnitarioReferencial,
        precioTotal: Math.round(s.cantidad * s.precioUnitarioReferencial),
        origen: 'IA' as const,
        fase: s.fase || undefined,
        precioReferencial: true,
      })),
    ]);
    setHayCambios(true);
  };

  const agregarPartida = (fase?: string) => {
    setItems(actuales => [...actuales, nuevaPartida(actuales.length, 'Manual', fase)]);
    setHayCambios(true);
  };

  const eliminarPartida = (id: string) => {
    setItems(actuales => actuales.filter(it => it.id !== id));
    setHayCambios(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      // Al guardar se renumeran todas las partidas de forma correlativa (1, 1.1, 1.2, 2, 3.1, 3.2...)
      // — incluye tanto las que trajo la IA como las agregadas a mano, para que el itemizado final
      // quede con una numeración correlativa y legible, sin importar el orden en que se cargaron.
      const renumerados = renumerarPartidasCorrelativas(items);
      await updateProyectoMaestro(proyecto.id, {
        itemizado: renumerados,
        itemizadoMarkup: { gastosGeneralesPct, utilidadPct },
      });
      setItems(renumerados);
      setHayCambios(false);
      setErrorAutoguardado(false);
    } catch (err) {
      console.error('Error guardando itemizado:', err);
      alert('No se pudo guardar el itemizado. Intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  const sugerirConIA = async () => {
    setErrorIA(null);
    setSugiriendo(true);
    try {
      const sugerencias = await sugerirItemizadoConIA({
        nombre: proyecto.nombre,
        descripcion: proyecto.descripcion,
        tipoObra: proyecto.tipoObra,
        rubro: proyecto.rubro,
        uso: proyecto.uso,
      });
      if (!sugerencias.length) {
        setErrorIA('La IA no devolvió partidas. Intente nuevamente o complete el itemizado manualmente.');
        return;
      }
      setItems(actuales => [
        ...actuales,
        ...sugerencias.map((s, i) => ({
          id: `partida-ia-${Date.now()}-${i}`,
          item: s.item || String(actuales.length + i + 1),
          descripcion: s.descripcion,
          unidad: s.unidad || 'un',
          cantidad: 0,
          precioUnitario: 0,
          precioTotal: 0,
          origen: 'IA' as const,
          fase: s.fase || undefined,
        })),
      ]);
      setHayCambios(true);
    } catch (err) {
      console.error('Error sugiriendo itemizado con IA:', err);
      setErrorIA(mensajeErrorIA(err));
    } finally {
      setSugiriendo(false);
    }
  };

  const cargarDesdeArchivo = async (file: File) => {
    setAvisoImportacion(null);
    setCargandoExcel(true);
    const esPdf = file.name.toLowerCase().endsWith('.pdf');
    try {
      const resultado: ParsedPresupuestoImportado = esPdf ? await parsePresupuestoPdf(file) : await parsePresupuestoExcel(file);
      if (resultado.items.length === 0) {
        setAvisoImportacion({ tipo: 'error', mensajes: resultado.advertencias.length ? resultado.advertencias : ['No se encontraron partidas reconocibles en el archivo.'] });
        return;
      }

      // El archivo cargado REEMPLAZA por completo el itemizado actual (es el presupuesto de
      // referencia del proyecto, no un agregado) — a diferencia de "Sugerir con IA", que suma
      // partidas a lo ya existente. Si ya había partidas cargadas, se pide confirmación explícita
      // para no perderlas por error.
      if (items.length > 0) {
        const continuar = confirm(
          `Esto reemplazará las ${items.length} partida(s) actuales del itemizado por las ${resultado.items.length} partida(s) de "${file.name}". Las partidas actuales se perderán (a menos que las haya guardado y quiera recuperarlas después). ¿Confirma reemplazar?`
        );
        if (!continuar) return;
      }

      const origen = esPdf ? ('PDF' as const) : ('Excel' as const);
      // Se presentan igual que cualquier otra partida del itemizado: mismo esquema de columnas,
      // agrupadas y numeradas por fase junto con el resto de la página (ver agruparPorFase).
      const itemsNuevos = resultado.items.map((it, i) => ({
        id: `partida-${origen.toLowerCase()}-${Date.now()}-${i}`,
        item: it.item || String(i + 1),
        descripcion: it.descripcion,
        unidad: it.unidad,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        precioTotal: Math.round(it.cantidad * it.precioUnitario),
        origen,
        fase: it.fase,
        // Viene de un archivo externo (posiblemente armado con otra IA): se deja como referencia,
        // igual que "Presupuesto Preciso con IA", hasta que el usuario la valide o reemplace.
        precioReferencial: true,
      }));
      setItems(itemsNuevos);

      // Si el archivo trae Gastos Generales y/o Utilidad en su resumen final, se recalculan como
      // % (en vez de perderlos) para que el Total con IVA del sistema pueda calzar con el del
      // archivo original, siguiendo el mismo esquema en cascada (ver más abajo).
      const costoDirectoNuevo = itemsNuevos.reduce((sum, it) => sum + (it.precioTotal || 0), 0);
      const mensajesMarkup: string[] = [];
      if (costoDirectoNuevo > 0 && resultado.gastosGeneralesDetectados) {
        const pct = Math.round((resultado.gastosGeneralesDetectados / costoDirectoNuevo) * 10000) / 100;
        setGastosGeneralesPct(pct);
        mensajesMarkup.push(`Gastos Generales detectados: ${pct}% del Costo Directo (${formatoMonedaCLP(resultado.gastosGeneralesDetectados)}).`);
        if (costoDirectoNuevo && resultado.utilidadDetectada) {
          const baseUtilidad = costoDirectoNuevo + resultado.gastosGeneralesDetectados;
          const pctUtilidad = Math.round((resultado.utilidadDetectada / baseUtilidad) * 10000) / 100;
          setUtilidadPct(pctUtilidad);
          mensajesMarkup.push(`Utilidad detectada: ${pctUtilidad}% de Costo Directo + Gastos Generales (${formatoMonedaCLP(resultado.utilidadDetectada)}).`);
        }
      }

      setHayCambios(true);
      setAvisoImportacion({
        tipo: 'exito',
        mensajes: [`Itemizado reemplazado por ${resultado.items.length} partida(s) de "${file.name}".`, ...mensajesMarkup, ...resultado.advertencias.filter(a => !a.includes('no se importan como partidas'))],
      });
    } catch (err) {
      console.error('Error leyendo presupuesto desde archivo:', err);
      setAvisoImportacion({ tipo: 'error', mensajes: [`No se pudo leer el archivo. Verifique que sea un ${esPdf ? 'PDF' : 'Excel (.xlsx/.xls)'} válido.`] });
    } finally {
      setCargandoExcel(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3.5">
      <input
        ref={inputExcelRef}
        type="file"
        accept=".xlsx,.xls,.pdf"
        hidden
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = ''; // permite volver a elegir el mismo archivo si se corrige y se vuelve a subir
          if (file) cargarDesdeArchivo(file);
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-indigo-600" />
            Itemizado del Proyecto (Presupuesto Referencial por Partidas)
          </h3>
          <p className="text-[10px] text-slate-500 mt-0.5">
            Desglose progresivo del Presupuesto Estimado — se puede ir completando a medida que se detalla el alcance del proyecto.
          </p>
        </div>
        {items.length > 0 && !modoEdicion && (
          <button
            type="button"
            onClick={() => setModoEdicion(true)}
            className="flex items-center gap-1.5 bg-white hover:bg-indigo-50 border border-indigo-300 text-indigo-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
            title="Desbloquear el presupuesto para modificar partidas, cantidades o precios"
          >
            <Pencil className="w-3.5 h-3.5" /> Editar presupuesto
          </button>
        )}
        {items.length > 0 && modoEdicion && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setModoEdicion(false)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
              title="Bloquear de nuevo el presupuesto (los cambios ya se guardan solos)"
            >
              <Lock className="w-3.5 h-3.5" /> Terminar edición
            </button>
            <button
              type="button"
              onClick={() => setMostrarPresupuestoPreciso(true)}
              disabled={!isAIConfigured()}
              title={isAIConfigured() ? 'La IA pregunta datos técnicos (m2, estructura, etc.) y calcula cantidades y precios referenciales' : 'Configure VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY para habilitar esta función'}
              className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed border border-indigo-200 text-indigo-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
            >
              <Calculator className="w-3.5 h-3.5" /> Presupuesto Preciso con IA
            </button>
            <button
              type="button"
              onClick={sugerirConIA}
              disabled={sugiriendo || !isAIConfigured()}
              title={isAIConfigured() ? 'Proponer partidas típicas para este tipo de proyecto' : 'Configure VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY para habilitar esta función'}
              className="flex items-center gap-1.5 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed border border-violet-200 text-violet-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
            >
              {sugiriendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {sugiriendo ? 'Pensando…' : 'Sugerir más partidas con IA'}
            </button>
            <button
              type="button"
              onClick={() => inputExcelRef.current?.click()}
              disabled={cargandoExcel}
              title="Sube un Excel o PDF con el formato del Presupuesto Estimativo (Ítem, Descripción, Unidad, Cantidad, P. Unitario) y REEMPLAZA todo el itemizado actual por sus partidas, como referencia — el PDF es menos exacto, revise las partidas después"
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed border border-emerald-200 text-emerald-800 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
            >
              {cargandoExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
              {cargandoExcel ? 'Leyendo…' : 'Cargar desde Excel o PDF'}
            </button>
            <button
              type="button"
              onClick={() => agregarPartida()}
              className="flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 font-bold px-3 py-1.5 rounded-lg text-[11px] shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Agregar partida
            </button>
          </div>
        )}
      </div>

      {sugiriendo && (
        <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg p-2.5 text-[11px] text-violet-900">
          <Loader2 className="w-3.5 h-3.5 shrink-0 mt-0.5 animate-spin" />
          <span>La IA está proponiendo partidas. Si los servidores de Google están saturados, el sistema reintenta solo con otros modelos: puede tardar hasta 2–3 minutos.</span>
        </div>
      )}

      {errorIA && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{errorIA}</span>
        </div>
      )}

      {avisoImportacion && (
        <div className={`flex items-start gap-2 rounded-lg p-2.5 text-[11px] ${avisoImportacion.tipo === 'exito' ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
          <FileSpreadsheet className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {avisoImportacion.mensajes.map((m, i) => <p key={i}>{m}</p>)}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center text-center gap-3 py-10 px-6 border-2 border-dashed border-violet-200 rounded-2xl bg-violet-50/30">
          <Sparkles className="w-8 h-8 text-violet-400" />
          <div>
            <p className="text-sm font-bold text-slate-800">Empiece con una sugerencia de la IA</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-md">
              Analiza el nombre, tipo de obra y rubro del proyecto y propone partidas típicas organizadas por fase — desde ahí usted las edita, completa cantidad/precio o agrega más.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setMostrarPresupuestoPreciso(true)}
              disabled={!isAIConfigured()}
              title={isAIConfigured() ? 'La IA pregunta datos técnicos (m2, estructura, etc.) y calcula cantidades y precios referenciales' : 'Configure VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY para habilitar esta función'}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-sm"
            >
              <Calculator className="w-4 h-4" /> Presupuesto Preciso con IA
            </button>
            <button
              type="button"
              onClick={sugerirConIA}
              disabled={sugiriendo || !isAIConfigured()}
              title={isAIConfigured() ? 'Proponer partidas típicas para este tipo de proyecto' : 'Configure VITE_GEMINI_API_KEY o VITE_OPENAI_API_KEY para habilitar esta función'}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-sm"
            >
              {sugiriendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {sugiriendo ? 'Pensando…' : 'Sugerir partidas con IA'}
            </button>
            <button
              type="button"
              onClick={() => inputExcelRef.current?.click()}
              disabled={cargandoExcel}
              title="Sube un Excel o PDF con el formato del Presupuesto Estimativo (Ítem, Descripción, Unidad, Cantidad, P. Unitario) y REEMPLAZA todo el itemizado actual por sus partidas, como referencia — el PDF es menos exacto, revise las partidas después"
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-sm"
            >
              {cargandoExcel ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {cargandoExcel ? 'Leyendo…' : 'Cargar desde Excel o PDF'}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 max-w-sm">
            "Presupuesto Preciso" le pregunta datos técnicos del proyecto (m2, estructura, materialidad, etc.) y calcula cantidades y precios unitarios referenciales; "Sugerir partidas" solo propone la lista, sin cantidades ni precios; "Cargar desde Excel o PDF" reemplaza el itemizado por un presupuesto ya armado fuera del sistema (ej. con otra IA), como referencia — el Excel se lee con más precisión que el PDF.
          </p>
          <button
            type="button"
            onClick={() => agregarPartida()}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            o agregue una partida manualmente
          </button>
        </div>
      ) : (
      <>
      <datalist id="unidades-construccion">
        {UNIDADES_CONSTRUCCION.map(u => <option key={u} value={u} />)}
      </datalist>

      {!modoEdicion && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[11px] text-slate-600">
          <Lock className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          <span>Presupuesto en <strong>modo lectura</strong>. Para modificar partidas, cantidades o precios presione <strong>Editar presupuesto</strong>.</span>
        </div>
      )}

      <fieldset disabled={!modoEdicion} className="min-w-0 border-0 p-0 m-0">
      <div className={`overflow-x-auto border rounded-xl ${modoEdicion ? 'border-indigo-300 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
        <table className={`w-full text-[11px] min-w-[760px] ${modoEdicion ? '' : '[&_input]:bg-transparent [&_input]:border-transparent [&_select]:bg-transparent [&_select]:border-transparent [&_select]:appearance-none'}`}>
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="p-2 text-left w-14">Item</th>
              <th className="p-2 text-left w-40">Fase</th>
              <th className="p-2 text-left">Descripción</th>
              <th className="p-2 w-20">Unidad</th>
              <th className="p-2 w-24 text-right">Cantidad</th>
              <th className="p-2 w-28 text-right">P. Unitario</th>
              <th className="p-2 w-28 text-right">Total</th>
              <th className="p-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gruposPorFase.map(grupo => {
              const subtotalGrupo = grupo.items.reduce((sum, it) => sum + (it.precioTotal || 0), 0);
              return (
                <Fragment key={grupo.fase}>
                  <tr className="bg-indigo-50/70">
                    <td colSpan={8} className="p-1.5 text-[10px] font-extrabold uppercase text-indigo-900 tracking-wide">
                      <div className="flex items-center justify-between">
                        <span>{grupo.fase}</span>
                        {modoEdicion && (
                          <button
                            type="button"
                            onClick={() => agregarPartida(grupo.fase === SIN_FASE ? undefined : grupo.fase)}
                            className="text-indigo-600 hover:text-indigo-900 font-bold normal-case flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Agregar a esta fase
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {grupo.items.map(item => (
                    <tr key={item.id} className={item.origen === 'IA' ? 'bg-violet-50/40' : (item.origen === 'Excel' || item.origen === 'PDF') ? 'bg-emerald-50/40' : ''}>
                      <td className="p-1.5">
                        <input value={item.item} onChange={e => actualizarItem(item.id, { item: e.target.value })} className="w-14 p-1.5 border border-slate-200 rounded" />
                      </td>
                      <td className="p-1.5">
                        <select
                          value={item.fase || ''}
                          onChange={e => actualizarItem(item.id, { fase: e.target.value || undefined })}
                          className="w-full p-1.5 border border-slate-200 rounded text-[10px] bg-white"
                        >
                          <option value="">Sin fase</option>
                          {FASES_ITEMIZADO.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-1">
                          {item.origen === 'IA' && <Sparkles className="w-3 h-3 text-violet-500 shrink-0" aria-label="Sugerida por IA" />}
                          {item.origen === 'Excel' && <FileSpreadsheet className="w-3 h-3 text-emerald-600 shrink-0" aria-label="Cargada desde Excel" />}
                          {item.origen === 'PDF' && <Upload className="w-3 h-3 text-emerald-600 shrink-0" aria-label="Cargada desde PDF" />}
                          <input
                            value={item.descripcion}
                            onChange={e => actualizarItem(item.id, { descripcion: e.target.value })}
                            className="min-w-[220px] w-full p-1.5 border border-slate-200 rounded"
                            placeholder="Descripción de la partida"
                          />
                        </div>
                      </td>
                      <td className="p-1.5">
                        <input
                          value={item.unidad}
                          onChange={e => actualizarItem(item.id, { unidad: e.target.value })}
                          onFocus={e => e.target.select()}
                          list="unidades-construccion"
                          className="w-16 p-1.5 border border-slate-200 rounded text-center"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={textoCantidad[item.id] ?? (item.cantidad === 0 ? '' : formatearNumeroConMiles(item.cantidad))}
                          onFocus={e => e.target.select()}
                          onChange={e => {
                            const crudo = e.target.value;
                            setTextoCantidad(t => ({ ...t, [item.id]: formatearNumeroConMiles(crudo) }));
                            actualizarItem(item.id, { cantidad: desformatearNumero(crudo) });
                          }}
                          onBlur={() => setTextoCantidad(t => {
                            const { [item.id]: _omitido, ...resto } = t;
                            return resto;
                          })}
                          className="w-full p-1.5 border border-slate-200 rounded text-right"
                        />
                      </td>
                      <td className="p-1.5">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.precioUnitario === 0 ? '' : formatearEnteroConMiles(item.precioUnitario)}
                          onFocus={e => e.target.select()}
                          onChange={e => actualizarItem(item.id, { precioUnitario: desformatearEntero(e.target.value) })}
                          title={item.precioReferencial ? 'Precio referencial (IA o archivo cargado) — no es una cotización real, valídelo o reemplácelo' : undefined}
                          className={`w-full p-1.5 border rounded text-right ${item.precioReferencial ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200'}`}
                        />
                      </td>
                      <td className="p-2 text-right font-bold text-slate-700">{formatoMonedaCLP(item.precioTotal)}</td>
                      <td className="p-1 text-center">
                        {modoEdicion && (
                          <button type="button" onClick={() => eliminarPartida(item.id)} className="p-1 text-rose-500 hover:text-rose-700" title="Eliminar partida">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/70">
                    <td colSpan={6} className="p-1.5 text-right text-[10px] font-semibold text-slate-400 uppercase">Subtotal {grupo.fase}</td>
                    <td className="p-1.5 text-right text-[10px] font-bold text-slate-600">{formatoMonedaCLP(subtotalGrupo)}</td>
                    <td></td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          {items.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200">
                <td colSpan={6} className="p-2 text-right font-semibold text-slate-500 uppercase text-[10px]">Costo Directo</td>
                <td className="p-2 text-right font-bold text-slate-600">{formatoMonedaCLP(costoDirecto)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={5} className="p-2 text-right font-semibold text-slate-500 uppercase text-[10px]">Gastos Generales</td>
                <td className="p-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={gastosGeneralesPct || ''}
                      onChange={e => { setGastosGeneralesPct(Number(e.target.value) || 0); setHayCambios(true); }}
                      placeholder="0"
                      className="w-14 p-1 border border-slate-200 rounded text-right text-[11px]"
                    />
                    <span className="text-[10px] text-slate-400">%</span>
                  </div>
                </td>
                <td className="p-2 text-right font-bold text-slate-600">{formatoMonedaCLP(montoGastosGenerales)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={6} className="p-2 text-right font-semibold text-slate-500 uppercase text-[10px]">Subtotal + Gastos Generales</td>
                <td className="p-2 text-right font-bold text-slate-600">{formatoMonedaCLP(subtotalConGastosGenerales)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={5} className="p-2 text-right font-semibold text-slate-500 uppercase text-[10px]">Utilidad</td>
                <td className="p-1.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={utilidadPct || ''}
                      onChange={e => { setUtilidadPct(Number(e.target.value) || 0); setHayCambios(true); }}
                      placeholder="0"
                      className="w-14 p-1 border border-slate-200 rounded text-right text-[11px]"
                    />
                    <span className="text-[10px] text-slate-400">%</span>
                  </div>
                </td>
                <td className="p-2 text-right font-bold text-slate-600">{formatoMonedaCLP(montoUtilidad)}</td>
                <td></td>
              </tr>
              <tr className="border-t border-slate-200">
                <td colSpan={6} className="p-2 text-right font-semibold text-slate-500 uppercase text-[10px]">Total Neto</td>
                <td className="p-2 text-right font-bold text-slate-600">{formatoMonedaCLP(subtotalNeto)}</td>
                <td></td>
              </tr>
              <tr>
                <td colSpan={6} className="p-2 text-right font-semibold text-slate-500 uppercase text-[10px]">IVA ({tasaIva}%)</td>
                <td className="p-2 text-right font-bold text-slate-600">{formatoMonedaCLP(montoIva)}</td>
                <td></td>
              </tr>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={6} className="p-2 text-right font-bold text-slate-500 uppercase text-[10px]">Total (IVA incluido)</td>
                <td className="p-2 text-right font-black text-indigo-700">{formatoMonedaCLP(totalConIva)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </fieldset>
      </>
      )}

      {items.some(it => it.precioReferencial) && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Hay precios unitarios <strong>referenciales</strong> (de IA o de un archivo cargado, resaltados abajo) sin validar. Revíselos o reemplácelos por una cotización real antes de usar este itemizado como Presupuesto Estimado oficial.</span>
        </div>
      )}

      {totalConIva > 0 && totalConIva !== proyecto.valorAprox && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900">
          <span>
            El Presupuesto Estimado actual es <strong>{formatoMonedaCLP(proyecto.valorAprox || 0)}</strong>; el itemizado suma <strong>{formatoMonedaCLP(totalConIva)}</strong> (IVA incluido)
            {proyecto.valorAprox > 0 && Math.abs(totalConIva - proyecto.valorAprox) > proyecto.valorAprox * 0.1 ? ' — diferencia mayor al 10%.' : '.'}
          </span>
          <button
            type="button"
            onClick={async () => {
              setAplicandoPresupuesto(true);
              try {
                if (onUsarComoPresupuesto) await onUsarComoPresupuesto(totalConIva);
                else await updateProyectoMaestro(proyecto.id, { valorAprox: totalConIva });
              } catch (err) {
                console.error('Error actualizando el Presupuesto Estimado desde el itemizado:', err);
                alert('No se pudo actualizar el Presupuesto Estimado. Intente nuevamente.');
              } finally {
                setAplicandoPresupuesto(false);
              }
            }}
            disabled={aplicandoPresupuesto || !modoEdicion}
            title={modoEdicion ? undefined : 'Presione "Editar presupuesto" para aplicar este monto'}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-bold shrink-0 flex items-center gap-1.5"
          >
            {aplicandoPresupuesto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Usar {formatoMonedaCLP(totalConIva)} como Presupuesto Estimado
          </button>
        </div>
      )}

      {items.length > 0 && (
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={async () => {
            setExportando(true);
            try {
              await generarItemizadoExcel(proyecto, items, tasaIva);
            } catch (err) {
              console.error('Error exportando el itemizado a Excel:', err);
              alert('No se pudo generar el Excel. Intente nuevamente.');
            } finally {
              setExportando(false);
            }
          }}
          disabled={items.length === 0 || exportando}
          className="px-4 py-2 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-300 rounded-lg text-xs font-bold shadow-sm flex items-center gap-2"
        >
          {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {exportando ? 'Generando…' : 'Exportar Excel'}
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!hayCambios || guardando || !modoEdicion}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-2"
        >
          {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          {guardando ? 'Guardando…' : errorAutoguardado ? 'Reintentar guardado' : hayCambios ? 'Guardando cambios…' : 'Itemizado guardado'}
        </button>
      </div>
      )}

      {mostrarPresupuestoPreciso && (
        <PresupuestoPrecisoIAModal
          proyecto={{ nombre: proyecto.nombre, descripcion: proyecto.descripcion, tipoObra: proyecto.tipoObra, rubro: proyecto.rubro, uso: proyecto.uso }}
          onClose={() => setMostrarPresupuestoPreciso(false)}
          onAgregarPartidas={agregarPartidasPrecisas}
        />
      )}
    </div>
  );
}
