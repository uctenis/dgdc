import React, { useState } from 'react';
import { Cloud, ExternalLink, FolderOpen, Link2, Trash2 } from 'lucide-react';
import { TIPOS_DOCUMENTO_DRIVE, type DocumentoDrive, type ProyectoMaestro } from '../types';
import { updateProyectoMaestro } from '../services/firestoreService';
import { obtenerInfoEdificio, obtenerCampusPorSigla, etiquetaEdificio } from '../data/campusData';
import { esCarpetaDrive, esEnlaceDrive } from '../utils/driveLinks';
import { useAuth } from '../context/AuthContext';

interface DocumentosDrivePanelProps {
  proyecto: ProyectoMaestro;
}

/**
 * Documentos del proyecto que viven en Google Drive: el sistema guarda solo el enlace (carpeta del edificio,
 * carpeta del proyecto y los archivos vinculados), sin copiar nada. Cada cambio se guarda de inmediato.
 */
export const DocumentosDrivePanel: React.FC<DocumentosDrivePanelProps> = ({ proyecto }) => {
  const { user } = useAuth();
  const edificio = obtenerInfoEdificio(proyecto.edificioSigla);
  const driveCampus = (edificio?.campus || (proyecto.campusSigla ? obtenerCampusPorSigla(proyecto.campusSigla) : undefined))?.driveUrl;
  const documentos = proyecto.documentosDrive || [];
  // Misma convención de las carpetas de proyecto que ya existen en Drive: "26_006 Nombre".
  const nombreCarpetaSugerido = `${(proyecto.codigoProyecto || '').replace(/^20(?=\d\d_)/, '')} ${proyecto.nombre}`.trim();

  const [editandoCarpeta, setEditandoCarpeta] = useState(false);
  const [carpetaUrl, setCarpetaUrl] = useState(proyecto.driveCarpetaUrl || '');
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<DocumentoDrive['tipo']>('Plano');
  const [url, setUrl] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async (cambios: Partial<ProyectoMaestro>) => {
    setGuardando(true);
    setError('');
    try {
      await updateProyectoMaestro(proyecto.id, cambios);
      return true;
    } catch (err) {
      console.error('Error guardando enlaces de Drive:', err);
      setError('No se pudo guardar. Intente nuevamente.');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const guardarCarpeta = async () => {
    const limpia = carpetaUrl.trim();
    if (limpia && !esCarpetaDrive(limpia)) {
      setError('Pegue el enlace de una carpeta de Google Drive (https://drive.google.com/drive/folders/…).');
      return;
    }
    if (await guardar({ driveCarpetaUrl: limpia })) setEditandoCarpeta(false);
  };

  const vincular = async (e: React.FormEvent) => {
    e.preventDefault();
    const enlace = url.trim();
    if (!esEnlaceDrive(enlace)) {
      setError('El enlace debe ser de Google Drive (drive.google.com o docs.google.com).');
      return;
    }
    if (documentos.some(d => d.url === enlace)) {
      setError('Ese enlace ya está vinculado a este proyecto.');
      return;
    }
    const nuevo: DocumentoDrive = {
      id: `drive-${Date.now()}`,
      nombre: nombre.trim(),
      tipo,
      url: enlace,
      fechaVinculo: new Date().toISOString().split('T')[0],
      vinculadoPor: user?.email || undefined,
    };
    if (await guardar({ documentosDrive: [...documentos, nuevo] })) {
      setNombre('');
      setUrl('');
    }
  };

  const quitar = async (doc: DocumentoDrive) => {
    if (!confirm(`¿Quitar "${doc.nombre}" de la ficha? El archivo sigue en Drive: solo se quita el enlace.`)) return;
    await guardar({ documentosDrive: documentos.filter(d => d.id !== doc.id) });
  };

  const input = 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-500 font-medium disabled:opacity-50';

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
            <Cloud className="w-4 h-4 text-sky-600" />
            <span>Planos y Documentos en Google Drive</span>
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Los archivos se quedan en Drive: aquí solo se guarda el enlace, así siempre se abre la versión vigente. Uso interno (los proveedores no ven estos enlaces).
          </p>
        </div>
        <span className="text-[11px] font-bold text-sky-700 bg-sky-100 px-2.5 py-0.5 rounded-full whitespace-nowrap">
          {documentos.length} Enlace(s)
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
          <p className="text-[10px] font-extrabold uppercase text-slate-500">Carpeta del edificio</p>
          {edificio?.driveUrl ? (
            <a href={edificio.driveUrl} target="_blank" rel="noreferrer" className="font-bold text-sky-700 hover:underline flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span className="truncate">{etiquetaEdificio(edificio.sigla)}</span>
            </a>
          ) : (
            <p className="text-slate-500">
              {proyecto.edificioSigla
                ? 'Este edificio aún no tiene su carpeta de Drive. Se agrega en Configuración → Sedes & Campus.'
                : 'El proyecto no tiene edificio asignado.'}
            </p>
          )}
          <p className="text-[10px] text-slate-400">Planos existentes y antecedentes permanentes del edificio.</p>
          {driveCampus && (
            <a href={driveCampus} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-sky-700 hover:underline flex items-center gap-1.5 pt-1">
              <FolderOpen className="w-3.5 h-3.5 shrink-0" />
              Carpeta del campus {proyecto.campusSigla}
            </a>
          )}
        </div>

        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
          <p className="text-[10px] font-extrabold uppercase text-slate-500">Carpeta del proyecto</p>
          {editandoCarpeta ? (
            <div className="space-y-1.5">
              <input
                type="url"
                autoFocus
                placeholder="https://drive.google.com/drive/folders/…"
                value={carpetaUrl}
                onChange={e => setCarpetaUrl(e.target.value)}
                disabled={guardando}
                className={input}
              />
              <div className="flex gap-2">
                <button type="button" onClick={guardarCarpeta} disabled={guardando} className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold rounded-lg">Guardar</button>
                <button type="button" onClick={() => { setEditandoCarpeta(false); setCarpetaUrl(proyecto.driveCarpetaUrl || ''); setError(''); }} className="px-3 py-1.5 text-slate-600 hover:bg-slate-200 rounded-lg font-semibold">Cancelar</button>
              </div>
            </div>
          ) : proyecto.driveCarpetaUrl ? (
            <div className="flex items-center justify-between gap-2">
              <a href={proyecto.driveCarpetaUrl} target="_blank" rel="noreferrer" className="font-bold text-sky-700 hover:underline flex items-center gap-1.5 min-w-0">
                <FolderOpen className="w-4 h-4 shrink-0" />
                <span className="truncate">Abrir carpeta del proyecto</span>
              </a>
              <button type="button" onClick={() => { setCarpetaUrl(proyecto.driveCarpetaUrl || ''); setEditandoCarpeta(true); }} className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 shrink-0">Cambiar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setEditandoCarpeta(true)} className="font-bold text-sky-700 hover:underline flex items-center gap-1.5">
              <Link2 className="w-4 h-4" />
              Asociar carpeta de Drive
            </button>
          )}
          {!proyecto.driveCarpetaUrl && (
            <p className="text-[10px] text-slate-500">
              Cree la carpeta en Drive (en la del campus, como las demás, o en la del edificio) y pegue aquí su enlace. Nombre sugerido:{' '}
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(nombreCarpetaSugerido)}
                title="Copiar nombre"
                className="font-mono font-bold text-slate-700 hover:text-sky-700 underline decoration-dotted"
              >
                {nombreCarpetaSugerido}
              </button>
            </p>
          )}
        </div>
      </div>

      <form onSubmit={vincular} className="bg-sky-50/50 p-4 rounded-xl border border-sky-200 space-y-3">
        <span className="font-bold text-sky-950 text-xs flex items-center gap-1.5">
          <Link2 className="w-4 h-4 text-sky-600" />
          <span>Vincular un plano o documento de Drive</span>
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <input
              type="text"
              required
              placeholder="Nombre (ej: Plano de arquitectura nivel 1)"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              disabled={guardando}
              className={input}
            />
          </div>
          <select value={tipo} onChange={e => setTipo(e.target.value as DocumentoDrive['tipo'])} disabled={guardando} className={`${input} font-semibold`}>
            {TIPOS_DOCUMENTO_DRIVE.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            required
            placeholder="Enlace de Drive (en Drive: clic derecho → Compartir → Copiar enlace)"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={guardando}
            className={input}
          />
          <button
            type="submit"
            disabled={guardando || !nombre.trim() || !url.trim()}
            className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white font-bold rounded-lg text-xs transition shadow-sm whitespace-nowrap"
          >
            {guardando ? 'Guardando…' : 'Vincular'}
          </button>
        </div>
      </form>

      {error && <p className="text-[11px] text-red-700 font-semibold">{error}</p>}

      {documentos.length > 0 && (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-200">
          {documentos.map(doc => (
            <div key={doc.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition">
              <a href={doc.url} target="_blank" rel="noreferrer" className="min-w-0 flex items-center gap-2 group">
                <ExternalLink className="w-4 h-4 text-sky-600 shrink-0" />
                <span className="min-w-0">
                  <strong className="text-slate-900 block truncate group-hover:underline">{doc.nombre}</strong>
                  <span className="text-[10px] text-slate-500">
                    {esCarpetaDrive(doc.url) ? 'Carpeta' : 'Archivo'} en Drive · vinculado el {doc.fechaVinculo}{doc.vinculadoPor ? ` por ${doc.vinculadoPor}` : ''}
                  </span>
                </span>
              </a>
              <div className="flex items-center gap-2 shrink-0">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-sky-100 text-sky-900 border border-sky-200">{doc.tipo}</span>
                <button type="button" onClick={() => quitar(doc)} disabled={guardando} className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg transition" title="Quitar enlace (el archivo sigue en Drive)">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
