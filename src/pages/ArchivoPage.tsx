import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileText, Loader2, ShieldX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { obtenerBlobArchivo, urlArchivo } from '../services/archivosService';

/**
 * Abre un archivo guardado en el sistema (/archivo/:id). Las reglas de Firebase deciden si la sesión actual puede
 * verlo: la UCT ve todo; el proveedor, sus ofertas y los antecedentes de sus licitaciones; la empresa que se inscribe,
 * sus documentos mientras la inscripción esté abierta. Los PDF e imágenes se muestran; el resto se descarga.
 */
export function ArchivoPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'sin-permiso' | 'no-existe'>('cargando');
  const [archivo, setArchivo] = useState<{ url: string; nombre: string; tipo: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    let vigente = true;
    let objeto: string | undefined;
    setEstado('cargando');
    obtenerBlobArchivo(urlArchivo(id))
      .then(({ blob, nombre }) => {
        if (!vigente) return;
        objeto = URL.createObjectURL(blob);
        const nombreFinal = nombre || 'archivo';
        setArchivo({ url: objeto, nombre: nombreFinal, tipo: blob.type });
        setEstado('listo');
        document.title = nombreFinal;
        // Lo que el navegador no puede mostrar (Excel, Word, zip) se descarga de inmediato con su nombre.
        if (!/^(application\/pdf|image\/|text\/)/.test(blob.type)) {
          const a = document.createElement('a');
          a.href = objeto;
          a.download = nombreFinal;
          a.click();
        }
      })
      .catch(err => {
        if (!vigente) return;
        const msg = String((err as { code?: string; message?: string })?.code || (err as Error)?.message || '');
        setEstado(/permission|insufficient/i.test(msg) ? 'sin-permiso' : 'no-existe');
      });
    return () => { vigente = false; if (objeto) URL.revokeObjectURL(objeto); };
  }, [id, loading, user]);

  if (estado === 'cargando') {
    return <div className="min-h-screen flex items-center justify-center gap-2 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Abriendo archivo…</div>;
  }
  if (estado !== 'listo' || !archivo) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-100">
        <div className="max-w-md bg-white rounded-2xl shadow p-8 text-center space-y-3">
          <ShieldX className="w-10 h-10 text-slate-400 mx-auto" />
          <h1 className="text-lg font-bold text-slate-800">{estado === 'sin-permiso' ? 'No tiene acceso a este archivo' : 'Archivo no encontrado'}</h1>
          <p className="text-sm text-slate-600">
            {estado === 'sin-permiso'
              ? (user ? `La cuenta ${user.email} no tiene permiso para ver este archivo.` : 'Inicie sesión con su cuenta UCT (o con el enlace de su invitación, si es proveedor) y vuelva a abrir el enlace.')
              : 'El archivo no existe o fue eliminado.'}
          </p>
          {estado === 'sin-permiso' && !user && <Link to="/login" className="inline-block px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-bold">Ingresar</Link>}
        </div>
      </div>
    );
  }

  const visible = /^(application\/pdf|image\/|text\/)/.test(archivo.tipo);
  return (
    <div className="h-screen flex flex-col bg-slate-800">
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 text-white text-sm">
        <FileText className="w-4 h-4 text-sky-300 shrink-0" />
        <span className="flex-1 truncate">{archivo.nombre}</span>
        <a href={archivo.url} download={archivo.nombre} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold">
          <Download className="w-3.5 h-3.5" /> Descargar
        </a>
      </div>
      {visible ? (
        archivo.tipo.startsWith('image/')
          ? <div className="flex-1 flex items-center justify-center p-4 overflow-auto"><img src={archivo.url} alt={archivo.nombre} className="max-w-full max-h-full" /></div>
          : <iframe src={archivo.url} title={archivo.nombre} className="flex-1 w-full bg-white" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-300 text-sm">La descarga comenzó. Si no, use el botón «Descargar».</div>
      )}
    </div>
  );
}
