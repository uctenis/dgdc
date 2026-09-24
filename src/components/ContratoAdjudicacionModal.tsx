import { useEffect, useRef, useState } from 'react';
import { X, FileText, Printer, Download, Loader2, ShieldCheck, ScrollText, AlertTriangle, FileType2, RefreshCw, UserCheck } from 'lucide-react';
import type { ProyectoMaestro, Proveedor, DatosContratista } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { updateProyectoMaestro, updateProveedor, cargarAntecedentesContrato } from '../services/firestoreService';
import { generarPdfDesdeElemento } from '../services/pdfGenerator';
import { generarDocumentoSeccionesWord } from '../services/docxGenerator';
import type { ModalidadContrato } from '../data/basesTemplateData';
import { REPRESENTANTE_UNIVERSIDAD, type SeccionContrato } from '../data/contratoTemplateData';
import { useAuth } from '../context/AuthContext';
import { PremiumDatePicker } from './PremiumDatePicker';
import { DatosContratistaForm } from './DatosContratistaForm';
import { datosContratistaVacios, faltantesDatosContratista } from '../utils/datosContratista';
import {
  construirContrato, faltantesContrato, sumarDiasCorridos, formatearFechaLarga,
  type EntradaContrato,
} from '../utils/contratoBuilder';

interface ContratoAdjudicacionModalProps {
  proyecto: ProyectoMaestro;
  proveedores: Proveedor[];
  onClose: () => void;
}

type Antecedentes = Awaited<ReturnType<typeof cargarAntecedentesContrato>>;

export function ContratoAdjudicacionModal({ proyecto, proveedores, onClose }: ContratoAdjudicacionModalProps) {
  const { user, profile, isAdmin } = useAuth();
  const docRef = useRef<HTMLDivElement>(null);
  const [guardando, setGuardando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [generandoWord, setGenerandoWord] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [antecedentes, setAntecedentes] = useState<Antecedentes>({});
  const [proveedorFicha, setProveedorFicha] = useState<Proveedor | null>(null);
  const [datosContratista, setDatosContratista] = useState<DatosContratista>(datosContratistaVacios());
  const [mostrarDatos, setMostrarDatos] = useState(false);
  const [guardandoFicha, setGuardandoFicha] = useState(false);

  const modalidadInicial: ModalidadContrato = proyecto.modalidadContrato || 'Suma Alzada';
  const [modalidad, setModalidad] = useState<ModalidadContrato>(modalidadInicial);
  const [fechaContrato, setFechaContrato] = useState(() => new Date().toISOString().split('T')[0]);
  const [fechaInicioObra, setFechaInicioObra] = useState(proyecto.fechaInicio || '');
  const [secciones, setSecciones] = useState<SeccionContrato[]>(proyecto.contrato?.secciones || []);
  const [estado, setEstado] = useState<NonNullable<ProyectoMaestro['contrato']>['estado']>(proyecto.contrato?.estado || 'Borrador');

  const nombreProveedor = proyecto.proveedorAdjudicadoNombre || antecedentes.licitacion?.proveedorAdjudicadoNombre || '';
  const rutProveedor = proyecto.proveedorAdjudicadoRut || antecedentes.licitacion?.proveedorAdjudicadoRut || '';
  const plazoDiasNum = proyecto.plazoEjecucionDias || antecedentes.licitacion?.plazoAdjudicadoDias || proyecto.duracionEstimadaDias || 0;
  const fechaTermino = fechaInicioObra && plazoDiasNum ? sumarDiasCorridos(fechaInicioObra, plazoDiasNum) : '';

  const armarEntrada = (a: Antecedentes = antecedentes, datos: DatosContratista = datosContratista): EntradaContrato => ({
    proyecto,
    licitacion: a.licitacion,
    cotizacion: a.cotizacion,
    proveedorNombre: nombreProveedor || a.licitacion?.proveedorAdjudicadoNombre || '',
    proveedorRut: rutProveedor || a.licitacion?.proveedorAdjudicadoRut || '',
    datosContratista: datos,
    fechaContrato,
    fechaInicioObra,
    modalidad,
  });

  // Carga la adjudicación completa (licitación, oferta ganadora, propuesta con los datos del contratista) y arma el borrador.
  useEffect(() => {
    let vigente = true;
    const rutLimpio = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
    cargarAntecedentesContrato(proyecto)
      .catch(err => { console.warn('No se pudieron cargar los antecedentes del contrato:', err); return {} as Antecedentes; })
      .then(a => {
        if (!vigente) return;
        const rut = proyecto.proveedorAdjudicadoRut || a.licitacion?.proveedorAdjudicadoRut || '';
        const ficha = proveedores.find(p => rutLimpio(p.rut) === rutLimpio(rut)) || a.proveedor || null;
        const dePropuesta = a.propuesta?.datosContrato;
        const datos =
          (dePropuesta && faltantesDatosContratista(dePropuesta).length === 0 ? dePropuesta : null)
          || ficha?.datosContrato || dePropuesta || datosContratistaVacios();
        setAntecedentes(a);
        setProveedorFicha(ficha);
        setDatosContratista(datos);
        setMostrarDatos(faltantesDatosContratista(datos).length > 0);
        if (!proyecto.contrato) {
          setSecciones(construirContrato({
            proyecto,
            licitacion: a.licitacion,
            cotizacion: a.cotizacion,
            proveedorNombre: proyecto.proveedorAdjudicadoNombre || a.licitacion?.proveedorAdjudicadoNombre || '',
            proveedorRut: rut,
            datosContratista: datos,
            fechaContrato,
            fechaInicioObra,
            modalidad,
          }));
        }
        setCargando(false);
      });
    return () => { vigente = false; };
    // Solo al abrir el contrato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const puedeEditarContenido = estado === 'Borrador';
  const puedeGestionarEstado = isAdmin || profile?.role === 'admin';
  const faltantes = faltantesContrato(armarEntrada());

  const actualizarSeccion = (id: string, contenido: string) => {
    setSecciones(prev => prev.map(s => (s.id === id ? { ...s, contenido } : s)));
  };

  const regenerar = () => {
    if (!confirm('Se volverá a generar todo el texto del contrato con los datos actuales (fechas, modalidad y datos del contratista). Se perderán las ediciones manuales que hayas hecho en el texto. ¿Continuar?')) return;
    setSecciones(construirContrato(armarEntrada()));
  };

  const guardarDatosEnFicha = async () => {
    if (!proveedorFicha) return;
    setGuardandoFicha(true);
    try {
      await updateProveedor(proveedorFicha.id, { datosContrato: datosContratista });
      alert('Datos de representación guardados en la ficha del proveedor.');
    } catch (err) {
      console.error('Error guardando los datos del contratista:', err);
      alert('No se pudieron guardar los datos en la ficha del proveedor.');
    } finally {
      setGuardandoFicha(false);
    }
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

  const repsFirmantes = datosContratista.representantes.filter(r => r.nombre.trim());
  const firmantes = [
    { nombre: REPRESENTANTE_UNIVERSIDAD.nombre, cargo: `${REPRESENTANTE_UNIVERSIDAD.cargo} — Universidad Católica de Temuco (MANDANTE)`, rut: REPRESENTANTE_UNIVERSIDAD.rut },
    ...(repsFirmantes.length > 0
      ? repsFirmantes.map(r => ({ nombre: r.nombre, cargo: `${nombreProveedor || '[Proveedor]'} (PRESTADOR)`, rut: r.rut }))
      : [{ nombre: nombreProveedor || '[Proveedor]', cargo: `RUT ${rutProveedor || '—'} (PRESTADOR)`, rut: '' }]),
  ];

  const exportarWord = async () => {
    setGenerandoWord(true);
    try {
      await generarDocumentoSeccionesWord({
        tituloDocumento: 'Contrato de Construcción',
        subtitulo: `Modalidad ${modalidad} — "${proyecto.nombre}"`,
        lineaCodigos: `${proyecto.codigoProyecto} · CP ${proyecto.codigoCP} · Entre la Universidad Católica de Temuco y ${nombreProveedor || '[Proveedor]'}`,
        secciones: secciones.map(s => ({
          titulo: s.titulo,
          contenido: s.tabla ? `${s.contenido}\n\n${s.tabla.map(f => f.join(' | ')).join('\n')}` : s.contenido,
        })),
        firmantes: firmantes.map(f => ({ nombre: f.nombre, cargo: f.cargo })),
        nombreArchivo: `Contrato_${proyecto.codigoProyecto || proyecto.id}.docx`,
      });
    } finally {
      setGenerandoWord(false);
    }
  };

  const BloqueFirmas = () => (
    <div className="flex flex-wrap justify-center gap-8 mt-10 text-center text-[10px]">
      {firmantes.map((f, i) => (
        <div key={i} className="min-w-[170px]">
          <div className="border-b border-slate-800 h-14"></div>
          <p className="mt-1 font-bold">{f.nombre}</p>
          {f.rut && <p className="text-slate-600">C.I. N° {f.rut}</p>}
          <p className="text-slate-500">{f.cargo}</p>
        </div>
      ))}
    </div>
  );

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
              Proveedor adjudicado: <strong>{nombreProveedor || '—'}</strong> · Monto: <strong>{formatoMonedaCLP(antecedentes.licitacion?.montoAdjudicadoTotal || proyecto.montoAdjudicado || 0)}</strong>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">

          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" /> Reuniendo la adjudicación, la oferta ganadora y los datos del contratista…
            </div>
          ) : (
            <>
              {/* Estado, modalidad y fechas */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Modalidad de Contrato</label>
                    <select
                      value={modalidad}
                      disabled={!puedeEditarContenido}
                      onChange={e => setModalidad(e.target.value as ModalidadContrato)}
                      className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-60"
                    >
                      <option value="Suma Alzada">Suma Alzada</option>
                      <option value="Serie de Precios">Serie de Precios</option>
                      <option value="Administración Directa">Administración Directa</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Fecha del Contrato</label>
                    <PremiumDatePicker
                      value={fechaContrato}
                      disabled={!puedeEditarContenido}
                      onChange={setFechaContrato}
                      className="flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold disabled:opacity-60 text-left"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Fecha de Inicio de Obra</label>
                    <PremiumDatePicker
                      value={fechaInicioObra}
                      disabled={!puedeEditarContenido}
                      onChange={setFechaInicioObra}
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

              {/* Datos que aún faltan */}
              {faltantes.length > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 text-xs text-amber-950 space-y-1">
                  <p className="font-extrabold">Datos pendientes para completar el contrato ({faltantes.length})</p>
                  <ul className="list-disc list-inside text-[11px] space-y-0.5">
                    {faltantes.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                  <p className="text-[10px] text-amber-800">En el texto aparecen entre [corchetes]. Complételos y pulse “Regenerar borrador” para actualizarlos.</p>
                </div>
              )}

              {/* Datos del contratista */}
              <div className="border border-slate-200 rounded-xl">
                <button
                  type="button"
                  onClick={() => setMostrarDatos(v => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                >
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-indigo-600" /> Datos del contratista para el contrato (representantes, domicilio, personería)
                  </span>
                  <span className="text-[11px] font-bold text-slate-500">{mostrarDatos ? 'Ocultar' : 'Ver / editar'}</span>
                </button>
                {mostrarDatos && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
                    <p className="text-[10px] text-slate-500">
                      {antecedentes.propuesta?.datosContrato ? 'Precargados desde lo que informó el proveedor en el portal al enviar su oferta.' : proveedorFicha?.datosContrato ? 'Precargados desde la ficha del proveedor.' : 'El proveedor aún no los informó: complételos aquí.'}
                    </p>
                    <DatosContratistaForm value={datosContratista} onChange={setDatosContratista} disabled={!puedeEditarContenido} conBanco />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={regenerar} disabled={!puedeEditarContenido} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5">
                        <RefreshCw className="w-3.5 h-3.5" /> Regenerar borrador con estos datos
                      </button>
                      {proveedorFicha && (
                        <button onClick={guardarDatosEnFicha} disabled={guardandoFicha} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold disabled:opacity-50">
                          {guardandoFicha ? 'Guardando…' : 'Guardar en la ficha del proveedor'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Documento capturable a PDF */}
              <div ref={docRef} className="bg-white p-9 border border-slate-200 rounded-lg text-slate-900" style={{ width: '760px', margin: '0 auto', fontFamily: 'Georgia, serif' }}>
                <div className="flex flex-col items-center text-center border-b-2 border-indigo-950 pb-4 mb-6">
                  <img src={`${import.meta.env.BASE_URL}logo-uct.png`} alt="Universidad Católica de Temuco" className="h-12 w-auto object-contain mb-2" />
                  <h1 className="text-lg font-bold uppercase">Contrato de Construcción</h1>
                  <p className="text-xs text-slate-600 mt-1 uppercase">Modalidad {modalidad}</p>
                  <p className="text-xs text-slate-700 mt-1 font-bold uppercase">“{proyecto.nombre}”</p>
                  <p className="text-[11px] text-slate-600 mt-1 uppercase">Entre la Universidad Católica de Temuco y</p>
                  <p className="text-xs font-bold uppercase">{nombreProveedor || '[Proveedor]'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{proyecto.codigoProyecto} · CP {proyecto.codigoCP}</p>
                </div>

                <div className="space-y-4">
                  {secciones.map(s => (
                    <div key={s.id} style={s.id === 'anexo1' ? { breakBefore: 'page' } : undefined}>
                      <h3 className="text-xs font-bold uppercase text-slate-800 mb-1">{s.titulo}</h3>
                      {puedeEditarContenido ? (
                        <textarea
                          value={s.contenido}
                          onChange={e => actualizarSeccion(s.id, e.target.value)}
                          rows={Math.min(16, Math.max(3, Math.ceil(s.contenido.length / 75)))}
                          className="w-full text-xs leading-relaxed border border-slate-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-emerald-400"
                        />
                      ) : (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{s.contenido}</p>
                      )}
                      {s.tabla && (
                        <div className="overflow-x-auto mt-2">
                          <table className="w-full text-[10px] border-collapse">
                            <thead>
                              <tr>{s.tabla[0].map((h, i) => <th key={i} className="border border-slate-300 bg-slate-100 px-1.5 py-1 text-left">{h}</th>)}</tr>
                            </thead>
                            <tbody>
                              {s.tabla.slice(1).map((fila, i) => (
                                <tr key={i}>{fila.map((c, j) => <td key={j} className={`border border-slate-300 px-1.5 py-1 ${j >= 3 ? 'text-right' : ''}`}>{c}</td>)}</tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {s.id === 'personerias' && <BloqueFirmas />}
                    </div>
                  ))}
                  {secciones.length > 0 && <BloqueFirmas />}
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
                Borrador generado según el contrato modelo suscrito por la Universidad (IGECE, marzo 2026), con los datos de la adjudicación, la oferta ganadora y el contratista.
                Verifique los datos institucionales (Rectora y su personería) y los valores de multas, retenciones y garantías; no reemplaza la revisión de Secretaría General antes de la firma.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
