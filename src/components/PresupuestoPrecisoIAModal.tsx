import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Loader2, AlertTriangle, ArrowLeft, PlusCircle, FileText, Upload, MapPin, Trash2, HelpCircle } from 'lucide-react';
import {
  sugerirPreguntasTecnicasConIA, sugerirPreguntasComplementariasConIA, sugerirItemizadoPrecisoConIA,
  CATEGORIAS_PREGUNTA_TECNICA, CATEGORIA_COMPLEMENTARIA, MAX_CARACTERES_ANTECEDENTE,
  type PreguntaTecnicaIA, type ItemItemizadoPrecisoSugeridoIA, type ContextoPresupuestoPreciso, mensajeErrorIA } from '../services/aiService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { getAllCotizaciones } from '../services/firestoreService';
import { preciosDesdeCotizaciones, referenciaHistorica, MIN_PRECIOS_HISTORICOS, type PrecioHistorico } from '../utils/preciosHistoricos';
import { extraerTextoPdf } from '../utils/pdfParser';

interface Props {
  /** Datos de la ficha del proyecto, incluida su ubicación (campus, edificio, dirección) y plazo. */
  proyecto: Omit<ContextoPresupuestoPreciso, 'notas' | 'antecedentes'>;
  onClose: () => void;
  onAgregarPartidas: (items: ItemItemizadoPrecisoSugeridoIA[]) => void;
}

type Fase = 'antecedentes' | 'cargando_preguntas' | 'formulario' | 'revisando' | 'generando' | 'resultado';

interface Antecedente {
  nombre: string;
  texto: string;
  paginas: number;
  truncado: boolean;
}

const MAX_ANTECEDENTES = 5;
const mensajeError = mensajeErrorIA;

export function PresupuestoPrecisoIAModal({ proyecto, onClose, onAgregarPartidas }: Props) {
  const [fase, setFase] = useState<Fase>('antecedentes');
  const [preguntas, setPreguntas] = useState<PreguntaTecnicaIA[]>([]);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ItemItemizadoPrecisoSugeridoIA[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historicos, setHistoricos] = useState<PrecioHistorico[]>([]);
  const [notas, setNotas] = useState('');
  const [antecedentes, setAntecedentes] = useState<Antecedente[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [avisoArchivos, setAvisoArchivos] = useState<string | null>(null);
  // La segunda vuelta de preguntas se hace una sola vez: después se genera con lo que haya.
  const [complementariasHechas, setComplementariasHechas] = useState(false);
  const [avisoComplementarias, setAvisoComplementarias] = useState(false);
  const inputArchivos = useRef<HTMLInputElement>(null);

  // Precios unitarios reales de ofertas anteriores: sirven para centrar la estimación de la IA en la media real.
  useEffect(() => {
    getAllCotizaciones()
      .then(cots => setHistoricos(preciosDesdeCotizaciones(cots)))
      .catch(err => console.warn('No se pudieron cargar precios históricos de ofertas:', err));
  }, []);

  const contexto = (): ContextoPresupuestoPreciso => ({
    ...proyecto,
    notas,
    antecedentes: antecedentes.map(a => ({ nombre: a.nombre, texto: a.texto })),
  });
  const respuestasParaIA = () => preguntas.map(p => ({
    pregunta: p.pregunta,
    respuesta: (respuestas[p.id] || '').trim() ? `${respuestas[p.id].trim()}${p.tipo === 'numero' && p.unidad ? ` ${p.unidad}` : ''}` : '',
  }));

  const agregarArchivos = async (lista: FileList | null) => {
    if (!lista?.length) return;
    setAvisoArchivos(null);
    setLeyendo(true);
    const avisos: string[] = [];
    const nuevos: Antecedente[] = [];
    for (const archivo of Array.from(lista)) {
      if (antecedentes.length + nuevos.length >= MAX_ANTECEDENTES) { avisos.push(`Se aceptan hasta ${MAX_ANTECEDENTES} archivos: "${archivo.name}" no se agregó.`); continue; }
      if (antecedentes.some(a => a.nombre === archivo.name) || nuevos.some(a => a.nombre === archivo.name)) continue;
      try {
        const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
        const esTexto = archivo.type.startsWith('text/') || /\.(txt|csv)$/i.test(archivo.name);
        if (!esPdf && !esTexto) { avisos.push(`"${archivo.name}": solo se leen archivos PDF o de texto.`); continue; }
        const leido = esPdf
          ? await extraerTextoPdf(archivo, MAX_CARACTERES_ANTECEDENTE)
          : await archivo.text().then(t => ({ texto: t.slice(0, MAX_CARACTERES_ANTECEDENTE), paginas: 1, truncado: t.length > MAX_CARACTERES_ANTECEDENTE }));
        if (leido.texto.trim().length < 40) {
          avisos.push(`"${archivo.name}": no tiene texto legible (parece escaneado o es solo un dibujo). Anote sus datos principales en las notas.`);
          continue;
        }
        nuevos.push({ nombre: archivo.name, ...leido });
      } catch (err) {
        console.error('Error leyendo antecedente:', err);
        avisos.push(`"${archivo.name}": no se pudo leer el archivo.`);
      }
    }
    setAntecedentes(actuales => [...actuales, ...nuevos]);
    setAvisoArchivos(avisos.length ? avisos.join(' ') : null);
    setLeyendo(false);
    if (inputArchivos.current) inputArchivos.current.value = '';
  };

  const cargarPreguntas = async () => {
    setFase('cargando_preguntas');
    setError(null);
    try {
      const sugeridas = await sugerirPreguntasTecnicasConIA(contexto());
      if (!sugeridas.length) {
        setError('La IA no propuso preguntas técnicas para este proyecto. Puede continuar agregando el itemizado manualmente.');
        return;
      }
      setPreguntas(sugeridas);
      // Lo que la IA encontró en los antecedentes queda respondido, a la espera de que el usuario lo confirme.
      setRespuestas(Object.fromEntries(sugeridas.filter(p => p.respuestaSugerida).map(p => {
        const sugerida = p.respuestaSugerida as string;
        if (p.tipo === 'numero') return [p.id, sugerida.replace(/[^0-9.,]/g, '')];
        if (p.tipo === 'seleccion') return [p.id, (p.opciones || []).find(o => o.toLowerCase() === sugerida.toLowerCase()) || ''];
        return [p.id, sugerida];
      }).filter(([, valor]) => valor)));
      setComplementariasHechas(false);
      setAvisoComplementarias(false);
      setFase('formulario');
    } catch (err) {
      console.error('Error obteniendo preguntas técnicas con IA:', err);
      setError(mensajeError(err));
    }
  };

  const generarItemizado = async () => {
    setFase('generando');
    setError(null);
    try {
      const items = await sugerirItemizadoPrecisoConIA({ ...contexto(), respuestas: respuestasParaIA() });
      if (!items.length) {
        setError('La IA no devolvió partidas con estos datos. Intente nuevamente o complete el itemizado manualmente.');
        setFase('formulario');
        return;
      }
      // Con suficientes precios reales similares, el precio final es el promedio entre la media de la IA y la
      // mediana de lo ofertado a la universidad: así no queda ni tan alto ni tan bajo.
      setResultado(items.map(it => {
        const ref = referenciaHistorica(it.descripcion, it.unidad, historicos);
        if (!ref) return it;
        const precio = ref.cantidad >= MIN_PRECIOS_HISTORICOS
          ? Math.round((it.precioUnitarioReferencial + ref.mediana) / 2)
          : it.precioUnitarioReferencial;
        return { ...it, precioUnitarioReferencial: precio, precioHistorico: ref };
      }));
      setFase('resultado');
    } catch (err) {
      console.error('Error generando presupuesto preciso con IA:', err);
      setError(mensajeError(err));
      setFase('formulario');
    }
  };

  /** Antes de generar, la IA revisa las respuestas y, una sola vez, pide lo que aún le falta. */
  const continuar = async () => {
    if (complementariasHechas) return generarItemizado();
    setFase('revisando');
    setError(null);
    setComplementariasHechas(true);
    try {
      const extra = await sugerirPreguntasComplementariasConIA({ ...contexto(), respuestas: respuestasParaIA() });
      const yaHechas = new Set(preguntas.map(p => p.pregunta.toLowerCase()));
      const nuevas = extra.filter(p => !yaHechas.has(p.pregunta.toLowerCase()));
      if (nuevas.length) {
        setPreguntas(actuales => [...actuales, ...nuevas]);
        setAvisoComplementarias(true);
        setFase('formulario');
        return;
      }
    } catch (err) {
      // La segunda vuelta es una ayuda: si falla, se genera igual con lo respondido.
      console.warn('No se pudieron obtener preguntas complementarias:', err);
    }
    return generarItemizado();
  };

  const totalReferencial = resultado.reduce((sum, it) => sum + it.cantidad * it.precioUnitarioReferencial, 0);
  const supuestos = resultado.filter(it => it.origenCantidad === 'supuesto').length;

  const respondida = (p: PreguntaTecnicaIA) => Boolean((respuestas[p.id] || '').trim());
  const claves = preguntas.filter(p => p.clave);
  const clavesSinResponder = claves.filter(p => !respondida(p)).length;
  const categorias = [...CATEGORIAS_PREGUNTA_TECNICA, CATEGORIA_COMPLEMENTARIA] as string[];
  const grupos = [
    ...categorias.map(c => ({ categoria: c, lista: preguntas.filter(p => p.categoria === c) })),
    { categoria: 'Otros datos', lista: preguntas.filter(p => !p.categoria || !categorias.includes(p.categoria)) },
  ].filter(g => g.lista.length > 0);

  const datosUbicacion = [proyecto.ubicacion, proyecto.edificio, proyecto.direccion].filter(Boolean);

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] flex flex-col border border-slate-200">
        <div className="flex items-center justify-between border-b pb-3.5 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-violet-100 text-violet-800 px-2.5 py-0.5 rounded flex items-center gap-1 w-fit">
              <Sparkles className="w-3 h-3" /> Presupuesto Preciso con IA
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1.5">{proyecto.nombre.toLocaleUpperCase('es-CL')}</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {fase === 'antecedentes' && (
            <>
              <p className="text-slate-500">
                Antes de preguntar, la IA revisa lo que ya se sabe del proyecto. Mientras más antecedentes entregue, más precisas serán las preguntas y menos tendrá que responder a mano.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                <span className="font-bold text-slate-700 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-indigo-600" /> Ubicación que se considerará</span>
                {datosUbicacion.length > 0 ? (
                  datosUbicacion.map(d => <p key={d} className="text-slate-600">{d}</p>)
                ) : (
                  <p className="text-amber-700">El proyecto no tiene campus ni edificio asignados: la IA no podrá considerar accesos, distancia ni datos del edificio. Asígnelos en la ficha del proyecto para un presupuesto más ajustado.</p>
                )}
                {datosUbicacion.length > 0 && !proyecto.direccion && (
                  <p className="text-amber-700">El campus no tiene dirección registrada (Configuración → Sedes &amp; Campus): no se podrá considerar la distancia a Temuco.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="font-bold text-slate-700 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-indigo-600" /> Antecedentes del proyecto (opcional)</span>
                <p className="text-slate-500">
                  Suba hasta {MAX_ANTECEDENTES} PDF con texto: especificaciones técnicas, informes, cotizaciones anteriores, cubicaciones o planos con cuadro de superficies. La IA toma de ahí los datos y solo le pide confirmarlos. Los planos escaneados o que son solo dibujo no se pueden leer.
                </p>
                <input
                  ref={inputArchivos}
                  type="file"
                  accept=".pdf,.txt,.csv,application/pdf,text/plain"
                  multiple
                  className="hidden"
                  onChange={e => agregarArchivos(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => inputArchivos.current?.click()}
                  disabled={leyendo || antecedentes.length >= MAX_ANTECEDENTES}
                  className="flex items-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50 rounded-lg font-bold text-slate-600"
                >
                  {leyendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {leyendo ? 'Leyendo…' : 'Agregar archivos'}
                </button>
                {antecedentes.map(a => (
                  <div key={a.nombre} className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5">
                    <FileText className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="flex-1 min-w-0 truncate font-semibold text-slate-700" title={a.nombre}>{a.nombre}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {a.paginas} pág. · {a.texto.length.toLocaleString('es-CL')} caracteres{a.truncado ? ' (se leyó solo el inicio)' : ''}
                    </span>
                    <button type="button" onClick={() => setAntecedentes(l => l.filter(x => x.nombre !== a.nombre))} className="text-slate-400 hover:text-rose-600" title="Quitar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {avisoArchivos && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <span>{avisoArchivos}</span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Lo que usted ya sabe (opcional)</label>
                <textarea
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  rows={4}
                  placeholder="Ej.: sala de 8 x 6 m en el 2° piso, sin ascensor. Se retira el cielo actual y se cambian 12 luminarias. Solo se puede trabajar después de las 18:00."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </>
          )}

          {fase === 'cargando_preguntas' && !error && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-sm font-bold text-slate-700">
                {antecedentes.length ? 'Leyendo los antecedentes y preparando las preguntas…' : 'Analizando el proyecto para saber qué preguntar…'}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={fase === 'formulario' ? generarItemizado : cargarPreguntas}
                  className="block font-bold text-violet-700 hover:text-violet-900 underline underline-offset-2"
                >
                  Reintentar
                </button>
              </div>
            </div>
          )}

          {fase === 'formulario' && !error && preguntas.length > 0 && (
            <>
              <p className="text-slate-500">
                Responda lo que sepa: lo que deje en blanco, la IA lo estimará con criterio conservador y lo marcará como supuesto en el resultado. Las preguntas con <span className="font-bold text-rose-600">*</span> son las que más cambian el monto.
              </p>
              {claves.length > 0 && (
                <p className={`font-bold ${clavesSinResponder ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {clavesSinResponder
                    ? `Faltan ${clavesSinResponder} de ${claves.length} datos clave por responder.`
                    : `Los ${claves.length} datos clave están respondidos.`}
                </p>
              )}
              {avisoComplementarias && (
                <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg p-3 text-violet-900">
                  <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>Con sus respuestas, la IA necesita precisar algunos datos más. Están al final, en «{CATEGORIA_COMPLEMENTARIA}». Puede responderlos o generar el itemizado tal como está.</span>
                </div>
              )}
              {grupos.map(g => (
                <div key={g.categoria} className="space-y-3">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-wide text-indigo-800 border-b border-indigo-100 pb-1">{g.categoria}</h4>
                  {g.lista.map(p => (
                    <div key={p.id}>
                      <label className="block font-semibold text-slate-700 mb-0.5">
                        {p.pregunta}{p.clave && <span className="text-rose-600" title="Dato clave"> *</span>}
                      </label>
                      {p.ayuda && <p className="text-[10px] text-slate-400 mb-1">{p.ayuda}</p>}
                      {p.tipo === 'seleccion' ? (
                        <select
                          value={respuestas[p.id] || ''}
                          onChange={e => setRespuestas(r => ({ ...r, [p.id]: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                        >
                          <option value="">-- Sin responder --</option>
                          {(p.opciones || []).map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : p.tipo === 'numero' ? (
                        <div className="relative flex items-center">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={respuestas[p.id] || ''}
                            onChange={e => setRespuestas(r => ({ ...r, [p.id]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                            className="w-full px-3 py-2 pr-14 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none font-bold text-emerald-700"
                          />
                          {p.unidad && (
                            <span className="absolute right-3 text-slate-400 font-semibold text-[11px]">{p.unidad}</span>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={respuestas[p.id] || ''}
                          onChange={e => setRespuestas(r => ({ ...r, [p.id]: e.target.value }))}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                        />
                      )}
                      {p.respuestaSugerida && (
                        <p className="text-[10px] text-emerald-700 mt-1 flex items-center gap-1">
                          <FileText className="w-3 h-3 shrink-0" />
                          Leído en {p.fuente || 'los antecedentes'}: «{p.respuestaSugerida}». Confírmelo o corríjalo.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          {(fase === 'revisando' || fase === 'generando') && (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-sm font-bold text-slate-700">
                {fase === 'revisando' ? 'Revisando sus respuestas por si falta algún dato…' : 'Calculando cantidades y precios referenciales…'}
              </p>
            </div>
          )}

          {fase === 'resultado' && (
            <>
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg p-3 text-amber-950">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span><strong>Precios referenciales de IA, no vinculantes.</strong> Cada precio es la media del rango de mercado regional (entre un contratista económico y uno caro){historicos.length > 0 ? `, promediada con la mediana de precios reales ofertados a la universidad cuando hay ${MIN_PRECIOS_HISTORICOS} o más partidas similares` : ''}. No es una cotización real: valide o reemplace cada precio unitario antes de usar este itemizado como Presupuesto Estimado oficial.</span>
              </div>
              {supuestos > 0 && (
                <p className="text-slate-600">
                  <strong className="text-amber-700">{supuestos} de {resultado.length} cantidades son supuestos</strong> de la IA por falta de datos (marcadas con «Supuesto»). Vuelva a las preguntas para precisarlas, o corríjalas después en el itemizado.
                </p>
              )}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="p-2 text-left">Fase</th>
                      <th className="p-2 text-left">Descripción</th>
                      <th className="p-2">Unidad</th>
                      <th className="p-2 text-right">Cantidad</th>
                      <th className="p-2 text-right">Rango mercado</th>
                      <th className="p-2 text-right">P. Unit. Referencial</th>
                      <th className="p-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultado.map((it, i) => (
                      <tr key={i}>
                        <td className="p-2 text-[10px] text-indigo-800 font-bold uppercase whitespace-nowrap align-top">{it.fase}</td>
                        <td className="p-2 min-w-[200px] align-top">
                          {it.descripcion}
                          {it.supuesto && (
                            <span className={`block text-[10px] mt-0.5 ${it.origenCantidad === 'supuesto' ? 'text-amber-700' : 'text-slate-400'}`}>
                              {it.origenCantidad === 'supuesto' && <strong>Supuesto: </strong>}{it.supuesto}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-center align-top">{it.unidad}</td>
                        <td className={`p-2 text-right align-top ${it.origenCantidad === 'supuesto' ? 'text-amber-700 font-semibold' : ''}`}>{it.cantidad.toLocaleString('es-CL')}</td>
                        <td className="p-2 text-right text-[10px] text-slate-500 whitespace-nowrap align-top">
                          {it.precioMinimo && it.precioMaximo && it.precioMinimo !== it.precioMaximo
                            ? `${formatoMonedaCLP(it.precioMinimo)} – ${formatoMonedaCLP(it.precioMaximo)}`
                            : '—'}
                        </td>
                        <td className="p-2 text-right text-amber-700 font-semibold align-top">
                          {formatoMonedaCLP(it.precioUnitarioReferencial)}
                          {it.precioHistorico && (
                            <span
                              className={`block text-[9px] font-medium ${it.precioHistorico.cantidad >= MIN_PRECIOS_HISTORICOS ? 'text-emerald-700' : 'text-slate-400'}`}
                              title={it.precioHistorico.cantidad >= MIN_PRECIOS_HISTORICOS
                                ? 'Promediado con la mediana de precios reales ofertados en partidas similares'
                                : `Solo como referencia: se necesitan ${MIN_PRECIOS_HISTORICOS} o más ofertas similares para ajustar el precio`}
                            >
                              Ofertas reales: {formatoMonedaCLP(it.precioHistorico.mediana)} ({it.precioHistorico.cantidad})
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right font-bold align-top">{formatoMonedaCLP(it.cantidad * it.precioUnitarioReferencial)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200">
                      <td colSpan={6} className="p-2 text-right font-bold text-slate-500 uppercase text-[10px]">Total Referencial (Neto)</td>
                      <td className="p-2 text-right font-black text-indigo-700">{formatoMonedaCLP(totalReferencial)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t shrink-0">
          {fase === 'resultado' ? (
            <button
              type="button"
              onClick={() => { setFase('formulario'); setResultado([]); }}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a las preguntas
            </button>
          ) : fase === 'formulario' || (fase === 'cargando_preguntas' && error) ? (
            <button
              type="button"
              onClick={() => { setError(null); setFase('antecedentes'); }}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition"
              title="Las preguntas se vuelven a generar con los antecedentes que deje"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a los antecedentes
            </button>
          ) : <div />}

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-xs">
              Cancelar
            </button>
            {fase === 'antecedentes' && (
              <button
                type="button"
                onClick={cargarPreguntas}
                disabled={leyendo}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" /> Preparar preguntas
              </button>
            )}
            {fase === 'formulario' && (
              <button
                type="button"
                onClick={continuar}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-bold text-xs shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5" /> Generar Itemizado
              </button>
            )}
            {fase === 'resultado' && (
              <button
                type="button"
                onClick={() => { onAgregarPartidas(resultado); onClose(); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-sm"
              >
                <PlusCircle className="w-3.5 h-3.5" /> Agregar al Itemizado
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
