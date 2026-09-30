import { useEffect, useState } from 'react';
import { FolderOpen, Loader2, Paperclip, Plus, Trash2, X } from 'lucide-react';
import { uploadDocumentoProveedor } from '../services/storageService';
import { useAuth } from '../context/AuthContext';
import { COLOR_VENCIMIENTO, estadoVencimiento, nombreDocumento, DIAS_AVISO_VENCIMIENTO } from '../utils/vencimientos';
import { TIPOS_DOCUMENTO_PROVEEDOR, type DocumentoProveedor, type Proveedor, type TipoDocumentoProveedor } from '../types';

interface Props {
  proveedor: Proveedor;
  onUpdateProveedor: (id: string, updated: Partial<Proveedor>) => Promise<void> | void;
  onClose: () => void;
}

/** Documentos que en la práctica se piden con fecha reciente: se sugiere su vencimiento al cargar la emisión. */
const VIGENCIA_SUGERIDA_DIAS: Partial<Record<TipoDocumentoProveedor, number>> = {
  'Certificado F30 (Antecedentes Laborales y Previsionales)': 30,
  'Certificado F30-1 (Cumplimiento de Obligaciones Laborales)': 30,
  'Certificado de Vigencia de la Sociedad': 60,
};

const sumarDias = (fecha: string, dias: number) => {
  const [a, m, d] = fecha.split('-').map(Number);
  const f = new Date(a, m - 1, d + dias);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};


/** Carpeta de documentos del proveedor con fechas de vencimiento (F30, vigencia de la sociedad, seguros...). */
export function DocumentosProveedorModal({ proveedor, onUpdateProveedor, onClose }: Props) {
  const { user } = useAuth();
  const documentos = proveedor.documentos || [];
  const [tipo, setTipo] = useState<TipoDocumentoProveedor>(TIPOS_DOCUMENTO_PROVEEDOR[0]);
  const [descripcion, setDescripcion] = useState('');
  const [fechaEmision, setFechaEmision] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [vencimientoSugerido, setVencimientoSugerido] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const cerrarConEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', cerrarConEsc);
    return () => window.removeEventListener('keydown', cerrarConEsc);
  }, [onClose]);

  // Sugiere el vencimiento según la emisión, sin pisar una fecha escrita a mano.
  useEffect(() => {
    const dias = VIGENCIA_SUGERIDA_DIAS[tipo];
    if (dias && fechaEmision && (!fechaVencimiento || vencimientoSugerido)) {
      setFechaVencimiento(sumarDias(fechaEmision, dias));
      setVencimientoSugerido(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, fechaEmision]);

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (tipo === 'Otro' && !descripcion.trim()) { setError('Indique qué documento es.'); return; }
    if (!archivo && !fechaVencimiento) { setError('Adjunte el documento o indique al menos su fecha de vencimiento.'); return; }
    setGuardando(true);
    try {
      const archivoURL = archivo ? await uploadDocumentoProveedor(proveedor.id, archivo) : undefined;
      const nuevo: DocumentoProveedor = {
        id: `${Date.now()}`,
        tipo,
        ...(tipo === 'Otro' ? { descripcion: descripcion.trim() } : {}),
        ...(fechaEmision ? { fechaEmision } : {}),
        ...(fechaVencimiento ? { fechaVencimiento } : {}),
        ...(archivo && archivoURL ? { archivoNombre: archivo.name, archivoURL } : {}),
        fechaCarga: new Date().toISOString(),
        ...(user?.email ? { cargadoPor: user.email } : {}),
      };
      // Un documento nuevo del mismo tipo reemplaza al anterior (ej. el F30 del mes).
      const resto = documentos.filter(d => tipo === 'Otro' || d.tipo !== tipo);
      await onUpdateProveedor(proveedor.id, { documentos: [...resto, nuevo] });
      setDescripcion(''); setFechaEmision(''); setFechaVencimiento(''); setVencimientoSugerido(false); setArchivo(null);
    } catch (err) {
      console.error('Error guardando el documento del proveedor:', err);
      setError('No se pudo guardar el documento. Intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (d: DocumentoProveedor) => {
    if (!confirm(`¿Quitar "${nombreDocumento(d)}" de la carpeta del proveedor?`)) return;
    await onUpdateProveedor(proveedor.id, { documentos: documentos.filter(x => x.id !== d.id) });
  };

  const campo = 'w-full px-3 py-2 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-400';
  const ordenados = [...documentos].sort((a, b) => (a.fechaVencimiento || '9999').localeCompare(b.fechaVencimiento || '9999'));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2"><FolderOpen className="w-4 h-4 text-sky-600" /> Documentos del proveedor</h3>
            <p className="text-[11px] text-slate-500">{proveedor.razonSocial} · RUT {proveedor.rut} · se avisa {DIAS_AVISO_VENCIMIENTO} días antes de cada vencimiento</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700" title="Cerrar (Esc)"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {ordenados.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Aún no hay documentos en la carpeta de este proveedor.</p>
          ) : (
            <div className="space-y-2">
              {ordenados.map(d => {
                const venc = estadoVencimiento(d.fechaVencimiento);
                return (
                  <div key={d.id} className="rounded-xl border border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">{nombreDocumento(d)}</p>
                      <p className="text-[10px] text-slate-500">
                        {d.fechaEmision ? `Emitido el ${new Date(`${d.fechaEmision}T12:00:00`).toLocaleDateString('es-CL')} · ` : ''}
                        Cargado el {new Date(d.fechaCarga).toLocaleDateString('es-CL')}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${COLOR_VENCIMIENTO[venc.nivel]}`}>{venc.texto}</span>
                    {d.archivoURL && (
                      <a href={d.archivoURL} target="_blank" rel="noreferrer" className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50" title={d.archivoNombre}>
                        <Paperclip className="w-3.5 h-3.5" /> Ver
                      </a>
                    )}
                    <button type="button" onClick={() => quitar(d)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Quitar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={agregar} className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
            <p className="text-xs font-bold text-slate-800">Agregar o renovar documento</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-[11px] font-semibold text-slate-600 sm:col-span-2">
                Documento
                <select className={campo} value={tipo} onChange={e => setTipo(e.target.value as TipoDocumentoProveedor)}>
                  {TIPOS_DOCUMENTO_PROVEEDOR.map(t => <option key={t}>{t}</option>)}
                </select>
              </label>
              {tipo === 'Otro' && (
                <label className="space-y-1 text-[11px] font-semibold text-slate-600 sm:col-span-2">
                  ¿Qué documento es?
                  <input className={campo} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: Inscripción en registro de contratistas" />
                </label>
              )}
              <label className="space-y-1 text-[11px] font-semibold text-slate-600">
                Fecha de emisión
                <input type="date" className={campo} value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} />
              </label>
              <label className="space-y-1 text-[11px] font-semibold text-slate-600">
                Fecha de vencimiento
                <input type="date" className={campo} value={fechaVencimiento} onChange={e => { setFechaVencimiento(e.target.value); setVencimientoSugerido(false); }} />
                {vencimientoSugerido && VIGENCIA_SUGERIDA_DIAS[tipo] && (
                  <span className="block text-[10px] font-normal text-sky-700">Sugerida: {VIGENCIA_SUGERIDA_DIAS[tipo]} días desde la emisión. Puede cambiarla.</span>
                )}
              </label>
              <label className="space-y-1 text-[11px] font-semibold text-slate-600 sm:col-span-2">
                Archivo (PDF o imagen)
                <input type="file" accept=".pdf,image/*" className="block w-full text-[11px] text-slate-600 file:mr-2 file:px-2.5 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-200 file:text-slate-700 file:text-[11px] file:font-bold" onChange={e => setArchivo(e.target.files?.[0] || null)} />
              </label>
            </div>
            <p className="text-[10px] text-slate-500">Si ya existe un documento del mismo tipo, el nuevo lo reemplaza.</p>
            {error && <p className="text-[11px] font-semibold text-red-700">{error}</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={guardando} className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold disabled:opacity-60">
                {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Guardar documento
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

