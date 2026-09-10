import { useRef, useState } from 'react';
import { X, FileText, Printer, Download, Loader2, ShieldCheck, ScrollText, AlertTriangle, FileType2 } from 'lucide-react';
import type { ProyectoMaestro } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { updateProyectoMaestro } from '../services/firestoreService';
import { generarPdfDesdeElemento } from '../services/pdfGenerator';
import { generarDocumentoSeccionesWord } from '../services/docxGenerator';
import { getPlantillaBasesPorTipoObra, obtenerFamiliaPorTipoObra, FAMILIA_BASES_LABEL, aplicarDatosAPlantilla, resolverContenidoGarantias, resolverContenidoModalidad, sugerirPoliticaGarantias, type SeccionBases, type ModalidadContrato } from '../data/basesTemplateData';
import { useAuth } from '../context/AuthContext';

interface BasesLicitacionModalProps {
  proyecto: ProyectoMaestro;
  onClose: () => void;
}

export function BasesLicitacionModal({ proyecto, onClose }: BasesLicitacionModalProps) {
  const { user, profile, isAdmin } = useAuth();
  const docRef = useRef<HTMLDivElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const datosMerge: Record<string, string> = {
    nombreProyecto: proyecto.nombre || '',
    campus: proyecto.campusNombre || proyecto.campusSigla || '—',
    edificio: proyecto.edificioSigla ? ` · Edificio ${proyecto.edificioSigla}` : '',
    montoEstimado: formatoMonedaCLP(proyecto.valorAprox || 0),
    plazoDias: proyecto.plazoEjecucionDias ? `${proyecto.plazoEjecucionDias}` : '[definir]',
    tipoObra: proyecto.tipoObra || '[definir]',
  };

  const familiaBases = obtenerFamiliaPorTipoObra(proyecto.tipoObra);
  const politicaGarantias = proyecto.politicaGarantias || sugerirPoliticaGarantias(proyecto.valorAprox || 0);
  const modalidadInicial: ModalidadContrato = proyecto.modalidadContrato || 'Suma Alzada';
  const [secciones, setSecciones] = useState<SeccionBases[]>(
    proyecto.bases?.secciones ||
    getPlantillaBasesPorTipoObra(proyecto.tipoObra).map(s => {
      if (s.id === 'garantias') return { ...s, contenido: aplicarDatosAPlantilla(resolverContenidoGarantias(politicaGarantias, s.contenido), datosMerge) };
      if (s.id === 'modalidad') return { ...s, contenido: resolverContenidoModalidad(modalidadInicial) };
      return { ...s, contenido: aplicarDatosAPlantilla(s.contenido, datosMerge) };
    })
  );
  const [modalidad, setModalidad] = useState<ModalidadContrato>(modalidadInicial);
  const [estado, setEstado] = useState<NonNullable<ProyectoMaestro['bases']>['estado']>(proyecto.bases?.estado || 'Borrador');

  const puedeEditarContenido = estado === 'Borrador';
  const puedeGestionarEstado = isAdmin || profile?.role === 'admin';

  const actualizarSeccion = (id: string, contenido: string) => {
    setSecciones(prev => prev.map(s => (s.id === id ? { ...s, contenido } : s)));
  };

  const guardar = async (nuevoEstado?: typeof estado) => {
    setGuardando(true);
    try {
      const estadoFinal = nuevoEstado || estado;
      await updateProyectoMaestro(proyecto.id, {
        modalidadContrato: modalidad,
        bases: {
          version: (proyecto.bases?.version || 0) + 1,
          estado: estadoFinal,
          secciones,
          fechaActualizacion: new Date().toISOString(),
          actualizadoPor: user?.email || '',
          ...(estadoFinal === 'Aprobada'
            ? { fechaAprobacion: new Date().toISOString().split('T')[0], aprobadoPor: user?.email || '' }
            : {}),
        },
      });
      setEstado(estadoFinal);
      alert(`Bases guardadas (estado: ${estadoFinal}).`);
    } finally {
      setGuardando(false);
    }
  };

  const exportarPdf = async () => {
    if (!docRef.current) return;
    setGenerandoPdf(true);
    try {
      const file = await generarPdfDesdeElemento(docRef.current, `Bases_${proyecto.codigoProyecto || proyecto.id}.pdf`);
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setGenerandoPdf(false);
    }
  };

  const [generandoWord, setGenerandoWord] = useState(false);
  const exportarWord = async () => {
    setGenerandoWord(true);
    try {
      await generarDocumentoSeccionesWord({
        tituloDocumento: 'Bases Administrativas y Técnicas',
        subtitulo: proyecto.nombre,
        lineaCodigos: `${proyecto.codigoProyecto} · CP ${proyecto.codigoCP} · Modalidad: ${modalidad}`,
        secciones,
        nombreArchivo: `Bases_${proyecto.codigoProyecto || proyecto.id}.docx`,
      });
    } finally {
      setGenerandoWord(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl space-y-5 max-h-[94vh] flex flex-col border border-slate-200">

        <div className="flex items-center justify-between border-b pb-4 shrink-0">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-indigo-100 text-indigo-900 px-2.5 py-0.5 rounded">
              Bases Administrativas y Técnicas · Borrador de trabajo
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1">{proyecto.codigoProyecto} — {(proyecto.nombre || '').toLocaleUpperCase('es-CL')}</h3>
            {!proyecto.bases && (
              <p className="text-[10px] text-slate-500 mt-1">
                Bases pre-cargadas desde la plantilla tipo: <strong>{FAMILIA_BASES_LABEL[familiaBases]}</strong> · Garantías: <strong>{politicaGarantias}</strong>
                {!proyecto.tipoObra && ' (el proyecto no tiene Tipo de Obra asignado — se usó la plantilla genérica; asígnelo en la Ficha o Cartera para una plantilla más precisa)'}
                {!proyecto.politicaGarantias && ' (política de garantías sugerida automáticamente por el monto — puede ajustarla editando el proyecto)'}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {/* Barra de estado y modalidad */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Modalidad de Contrato</label>
                <select
                  value={modalidad}
                  disabled={!puedeEditarContenido}
                  onChange={e => {
                    const nuevaModalidad = e.target.value as ModalidadContrato;
                    setModalidad(nuevaModalidad);
                    actualizarSeccion('modalidad', resolverContenidoModalidad(nuevaModalidad));
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-60"
                >
                  <option value="Suma Alzada">Suma Alzada</option>
                  <option value="Serie de Precios">Serie de Precios</option>
                  <option value="Administración Directa">Administración Directa</option>
                </select>
              </div>
              <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase border ${
                estado === 'Aprobada' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                estado === 'En Revisión Legal' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                'bg-slate-200 text-slate-700 border-slate-300'
              }`}>
                {estado}
              </span>
            </div>

            {puedeGestionarEstado && (
              <div className="flex gap-2">
                {estado === 'Borrador' && (
                  <button onClick={() => guardar('En Revisión Legal')} disabled={guardando} className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold disabled:opacity-50">
                    Enviar a Revisión Legal
                  </button>
                )}
                {estado === 'En Revisión Legal' && (
                  <>
                    <button onClick={() => guardar('Borrador')} disabled={guardando} className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-50">
                      Devolver a Borrador
                    </button>
                    <button onClick={() => guardar('Aprobada')} disabled={guardando} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold disabled:opacity-50">
                      Aprobar (Secretaría General)
                    </button>
                  </>
                )}
                {estado === 'Aprobada' && (
                  <button onClick={() => guardar('Borrador')} disabled={guardando} className="px-3 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[11px] font-bold disabled:opacity-50">
                    Reabrir como Borrador
                  </button>
                )}
              </div>
            )}
          </div>

          {!puedeEditarContenido && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>El contenido está bloqueado porque las bases ya están en <strong>{estado}</strong>. Solo un administrador puede reabrirlas como Borrador para editarlas.</span>
            </div>
          )}

          {/* Documento capturable a PDF */}
          <div ref={docRef} className="bg-white p-8 border border-slate-200 rounded-lg text-slate-900" style={{ width: '760px', margin: '0 auto', fontFamily: 'Georgia, serif' }}>
            <div className="text-center border-b-2 border-slate-800 pb-3 mb-5">
              <h1 className="text-lg font-bold uppercase">Bases Administrativas y Técnicas</h1>
              <p className="text-xs text-slate-600 mt-1">{proyecto.nombre}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{proyecto.codigoProyecto} · CP {proyecto.codigoCP} · Modalidad: {modalidad}</p>
            </div>

            <div className="space-y-4">
              {secciones.map(s => (
                <div key={s.id}>
                  <h3 className="text-xs font-bold uppercase text-slate-800 mb-1">{s.titulo}</h3>
                  {puedeEditarContenido ? (
                    <textarea
                      value={s.contenido}
                      onChange={e => actualizarSeccion(s.id, e.target.value)}
                      rows={3}
                      className="w-full text-xs leading-relaxed border border-slate-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{s.contenido}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => guardar()} disabled={guardando || !puedeEditarContenido} className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScrollText className="w-4 h-4" />}
              Guardar borrador
            </button>
            <button onClick={exportarPdf} disabled={generandoPdf} className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2">
              {generandoPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Exportar PDF
            </button>
            <button onClick={exportarWord} disabled={generandoWord} className="px-4 py-2.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2">
              {generandoWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileType2 className="w-4 h-4" />}
              Exportar Word (editable)
            </button>
            <button onClick={() => window.print()} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-2">
              <Printer className="w-4 h-4" /> Imprimir
            </button>
            {estado === 'Aprobada' && (
              <span className="flex items-center gap-1.5 text-emerald-700 text-xs font-bold px-2">
                <ShieldCheck className="w-4 h-4" /> Bases aprobadas — listas para convocar
              </span>
            )}
          </div>

          <p className="text-[10px] text-slate-400 flex items-start gap-1.5">
            <FileText className="w-3 h-3 shrink-0 mt-0.5" />
            Este documento parte de la plantilla maestra "Bases Tipo — Suma Alzada" (editable en Configuración). El contenido generado es un borrador de trabajo: no reemplaza la revisión legal de Secretaría General antes de convocar.
          </p>
        </div>
      </div>
    </div>
  );
}
