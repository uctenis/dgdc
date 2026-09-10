import { useRef, useState } from 'react';
import { X, FileText, Printer, Download, Loader2, ShieldCheck, ScrollText, AlertTriangle, FileType2 } from 'lucide-react';
import type { ProyectoMaestro, Proveedor } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { updateProyectoMaestro } from '../services/firestoreService';
import { generarPdfDesdeElemento } from '../services/pdfGenerator';
import { generarDocumentoSeccionesWord } from '../services/docxGenerator';
import { aplicarDatosAPlantilla, type ModalidadContrato } from '../data/basesTemplateData';
import {
  getPlantillaContratoObraCivil,
  resolverNotaModalidadPrecio,
  resolverNotaGarantiasContrato,
  type SeccionContrato,
} from '../data/contratoTemplateData';
import { useAuth } from '../context/AuthContext';
import { PremiumDatePicker } from './PremiumDatePicker';

interface ContratoAdjudicacionModalProps {
  proyecto: ProyectoMaestro;
  proveedores: Proveedor[];
  onClose: () => void;
}

/** Suma días corridos a una fecha (YYYY-MM-DD) sin desfases de zona horaria. */
function sumarDiasCorridos(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number);
  const fecha = new Date(y, (m || 1) - 1, d || 1);
  fecha.setDate(fecha.getDate() + dias);
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}

function formatearFechaLarga(fechaISO: string): string {
  if (!fechaISO) return '[por definir]';
  const [y, m, d] = fechaISO.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ContratoAdjudicacionModal({ proyecto, proveedores, onClose }: ContratoAdjudicacionModalProps) {
  const { user, profile, isAdmin } = useAuth();
  const docRef = useRef<HTMLDivElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);

  const proveedorAdjudicado = proveedores.find(
    p => p.rut.replace(/[^0-9kK]/g, '').toUpperCase() === (proyecto.proveedorAdjudicadoRut || '').replace(/[^0-9kK]/g, '').toUpperCase()
  );

  const modalidadInicial: ModalidadContrato = proyecto.modalidadContrato || 'Suma Alzada';
  const plazoDiasNum = proyecto.plazoEjecucionDias || 0;
  const [fechaInicioObra, setFechaInicioObra] = useState(proyecto.fechaInicio || '');
  const fechaTermino = fechaInicioObra && plazoDiasNum ? sumarDiasCorridos(fechaInicioObra, plazoDiasNum) : '';

  const construirDatosMerge = (fechaInicioVal: string, fechaTerminoVal: string): Record<string, string> => ({
    fechaContrato: new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }),
    nombreProyecto: proyecto.nombre || '',
    codigoProyecto: proyecto.codigoProyecto || '',
    codigoCP: proyecto.codigoCP || '',
    tipoObra: proyecto.tipoObra || '[definir]',
    campus: proyecto.campusNombre || proyecto.campusSigla || '—',
    edificio: proyecto.edificioSigla ? ` · Edificio ${proyecto.edificioSigla}` : '',
    proveedorNombre: proyecto.proveedorAdjudicadoNombre || '[Razón Social del Proveedor]',
    proveedorRut: proyecto.proveedorAdjudicadoRut || '[RUT del Proveedor]',
    proveedorRepresentante: proveedorAdjudicado?.nombreContacto || '[Nombre representante legal]',
    proveedorDireccion: proveedorAdjudicado ? `${proveedorAdjudicado.direccion || '[dirección]'}, ${proveedorAdjudicado.ciudad || 'Temuco'}` : '[dirección del proveedor]',
    montoAdjudicado: formatoMonedaCLP(proyecto.montoAdjudicado || 0),
    plazoDias: plazoDiasNum ? `${plazoDiasNum}` : '[definir]',
    fechaInicioObra: formatearFechaLarga(fechaInicioVal),
    fechaTermino: formatearFechaLarga(fechaTerminoVal),
    modalidadNombre: modalidadInicial,
    notaModalidadPrecio: resolverNotaModalidadPrecio(modalidadInicial),
    notaGarantias: resolverNotaGarantiasContrato(proyecto.politicaGarantias),
  });

  const datosMerge = construirDatosMerge(fechaInicioObra, fechaTermino);

  const [secciones, setSecciones] = useState<SeccionContrato[]>(
    proyecto.contrato?.secciones ||
    getPlantillaContratoObraCivil().map(s => ({ ...s, contenido: aplicarDatosAPlantilla(s.contenido, datosMerge) }))
  );
  const [modalidad, setModalidad] = useState<ModalidadContrato>(modalidadInicial);
  const [estado, setEstado] = useState<NonNullable<ProyectoMaestro['contrato']>['estado']>(proyecto.contrato?.estado || 'Borrador');

  const actualizarFechaInicio = (nuevaFecha: string) => {
    setFechaInicioObra(nuevaFecha);
    const nuevoTermino = nuevaFecha && plazoDiasNum ? sumarDiasCorridos(nuevaFecha, plazoDiasNum) : '';
    const nuevosDatos = construirDatosMerge(nuevaFecha, nuevoTermino);
    setSecciones(prev => prev.map(s => (
      s.id === 'plazo'
        ? { ...s, contenido: aplicarDatosAPlantilla(getPlantillaContratoObraCivil().find(x => x.id === 'plazo')?.contenido || '', nuevosDatos) }
        : s
    )));
  };

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
        ...(fechaInicioObra ? { fechaInicio: fechaInicioObra } : {}),
        ...(fechaTermino ? { fechaTermino } : {}),
        contrato: {
          version: (proyecto.contrato?.version || 0) + 1,
          estado: estadoFinal,
          secciones,
          fechaActualizacion: new Date().toISOString(),
          actualizadoPor: user?.email || '',
          ...(estadoFinal === 'Firmado'
            ? { fechaFirma: new Date().toISOString().split('T')[0], firmadoPor: user?.email || '' }
            : {}),
        },
      });
      setEstado(estadoFinal);
      alert(`Contrato guardado (estado: ${estadoFinal}).`);
    } finally {
      setGuardando(false);
    }
  };

  const exportarPdf = async () => {
    if (!docRef.current) return;
    setGenerandoPdf(true);
    try {
      const file = await generarPdfDesdeElemento(docRef.current, `Contrato_${proyecto.codigoProyecto || proyecto.id}.pdf`);
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
        tituloDocumento: 'Contrato de Construcción',
        subtitulo: `Modalidad ${modalidad} — "${proyecto.nombre}"`,
        lineaCodigos: `${proyecto.codigoProyecto} · CP ${proyecto.codigoCP} · Entre la Universidad Católica de Temuco y ${proyecto.proveedorAdjudicadoNombre || '[Proveedor]'}`,
        secciones,
        firmantes: [
          { nombre: 'Marcela Momberg Alarcón', cargo: 'Rectora — Universidad Católica de Temuco (MANDANTE)' },
          { nombre: proyecto.proveedorAdjudicadoNombre || '[Proveedor]', cargo: `RUT ${proyecto.proveedorAdjudicadoRut || '—'} (PRESTADOR)` },
        ],
        nombreArchivo: `Contrato_${proyecto.codigoProyecto || proyecto.id}.docx`,
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
            <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-900 px-2.5 py-0.5 rounded">
              Contrato de Adjudicación · Borrador de trabajo
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1">{proyecto.codigoProyecto} — {(proyecto.nombre || '').toLocaleUpperCase('es-CL')}</h3>
            <p className="text-[10px] text-slate-500 mt-1">
              Proveedor adjudicado: <strong>{proyecto.proveedorAdjudicadoNombre || '—'}</strong> · Monto: <strong>{formatoMonedaCLP(proyecto.montoAdjudicado || 0)}</strong>
              {!proveedorAdjudicado && ' (no se encontró el proveedor en la Base de Datos de Proveedores — complete sus datos manualmente en el documento)'}
            </p>
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
                    actualizarSeccion('precio', aplicarDatosAPlantilla(
                      getPlantillaContratoObraCivil().find(s => s.id === 'precio')?.contenido || '',
                      { ...datosMerge, modalidadNombre: nuevaModalidad, notaModalidadPrecio: resolverNotaModalidadPrecio(nuevaModalidad) }
                    ));
                  }}
                  className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-60"
                >
                  <option value="Suma Alzada">Suma Alzada</option>
                  <option value="Serie de Precios">Serie de Precios</option>
                  <option value="Administración Directa">Administración Directa</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Fecha de Inicio de Obra</label>
                <PremiumDatePicker
                  value={fechaInicioObra}
                  disabled={!puedeEditarContenido}
                  onChange={actualizarFechaInicio}
                  className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-60 text-left"
                />
              </div>
              {fechaInicioObra && plazoDiasNum > 0 && (
                <div className="text-[10px] text-slate-600">
                  <span className="font-bold uppercase text-slate-500 block">Fecha de Término (calculada)</span>
                  <span className="font-bold text-emerald-700">{formatearFechaLarga(fechaTermino)}</span>
                  <span className="text-slate-400"> ({plazoDiasNum} días corridos)</span>
                </div>
              )}
              <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase border ${
                estado === 'Firmado' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
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
                    <button onClick={() => guardar('Firmado')} disabled={guardando} className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold disabled:opacity-50">
                      Marcar como Firmado
                    </button>
                  </>
                )}
                {estado === 'Firmado' && (
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
              <span>El contenido está bloqueado porque el contrato ya está en <strong>{estado}</strong>. Solo un administrador puede reabrirlo como Borrador para editarlo.</span>
            </div>
          )}

          {/* Documento capturable a PDF */}
          <div ref={docRef} className="bg-white p-8 border border-slate-200 rounded-lg text-slate-900" style={{ width: '760px', margin: '0 auto', fontFamily: 'Georgia, serif' }}>
            <div className="text-center border-b-2 border-slate-800 pb-3 mb-5">
              <h1 className="text-lg font-bold uppercase">Contrato de Construcción</h1>
              <p className="text-xs text-slate-600 mt-1 uppercase">Modalidad {modalidad}</p>
              <p className="text-xs text-slate-700 mt-1 font-bold">"{proyecto.nombre}"</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{proyecto.codigoProyecto} · CP {proyecto.codigoCP} · Entre la Universidad Católica de Temuco y {proyecto.proveedorAdjudicadoNombre || '[Proveedor]'}</p>
            </div>

            <div className="space-y-4">
              {secciones.map(s => (
                <div key={s.id}>
                  <h3 className="text-xs font-bold uppercase text-slate-800 mb-1">{s.titulo}</h3>
                  {puedeEditarContenido ? (
                    <textarea
                      value={s.contenido}
                      onChange={e => actualizarSeccion(s.id, e.target.value)}
                      rows={4}
                      className="w-full text-xs leading-relaxed border border-slate-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{s.contenido}</p>
                  )}
                </div>
              ))}

              <div className="grid grid-cols-2 gap-8 mt-10 text-center text-[10px]">
                <div>
                  <div className="border-b border-slate-800 h-14"></div>
                  <p className="mt-1 font-bold">Marcela Momberg Alarcón</p>
                  <p className="text-slate-500">Rectora — Universidad Católica de Temuco (MANDANTE)</p>
                </div>
                <div>
                  <div className="border-b border-slate-800 h-14"></div>
                  <p className="mt-1 font-bold">{proyecto.proveedorAdjudicadoNombre || '[Proveedor]'}</p>
                  <p className="text-slate-500">RUT {proyecto.proveedorAdjudicadoRut || '—'} (PRESTADOR)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => guardar()} disabled={guardando || !puedeEditarContenido} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2">
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
            {estado === 'Firmado' && (
              <span className="flex items-center gap-1.5 text-emerald-700 text-xs font-bold px-2">
                <ShieldCheck className="w-4 h-4" /> Contrato firmado
              </span>
            )}
          </div>

          <p className="text-[10px] text-slate-400 flex items-start gap-1.5">
            <FileText className="w-3 h-3 shrink-0 mt-0.5" />
            Este documento parte de una plantilla basada en un contrato de construcción real de la Universidad y se pre-carga con los datos de la adjudicación. Es un borrador de trabajo: verifique los datos institucionales (representante legal, personerías) y no reemplaza la revisión de Secretaría General antes de la firma.
          </p>
        </div>
      </div>
    </div>
  );
}
