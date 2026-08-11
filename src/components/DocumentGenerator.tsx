import { useState } from 'react';
import type { LicitacionProyecto, Cotizacion, ConfiguracionFirmas, Proveedor } from '../types';
import { generarPlantillaCotizacionExcel } from '../services/templateGenerator';
import { FileCheck2, Download, CheckCircle2, AlertCircle, Printer, ShieldCheck, Upload, ExternalLink, FileSignature, Loader2, LockKeyhole } from 'lucide-react';
import { ActaEvaluacionModal } from './ActaEvaluacionModal';
import { useAuth } from '../context/AuthContext';
import { uploadFileToProjectFolder } from '../services/driveService';
import { updateLicitacion } from '../services/firestoreService';

interface DocumentGeneratorProps {
  licitacion: LicitacionProyecto | null;
  cotizaciones: Cotizacion[];
  proveedores: Proveedor[];
  configFirmas: ConfiguracionFirmas;
  onAdjudicarLicitacion: (licitacionId: string, proveedorId: string, justificacion: string) => void | Promise<void>;
}

export const DocumentGenerator: React.FC<DocumentGeneratorProps> = ({
  licitacion,
  cotizaciones,
  proveedores,
  configFirmas,
  onAdjudicarLicitacion,
}) => {
  const [actaAbierta, setActaAbierta] = useState(false);

  if (!licitacion) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-3">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-800">No hay ninguna licitación seleccionada</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Seleccione una licitación para abrir su acta oficial.
        </p>
      </div>
    );
  }

  const cotizacionesProyecto = cotizaciones.filter(c => c.licitacionId === licitacion.id);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <FileCheck2 className="w-6 h-6 text-sky-600" />
          <span>Acta oficial de evaluación y adjudicación</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Esta es la misma acta SGC disponible desde la ficha de la licitación. Su salida oficial se obtiene mediante “Imprimir / Exportar PDF”.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-extrabold bg-sky-100 text-sky-800 px-2.5 py-0.5 rounded border border-sky-200">
                SGC PS-FOR-DGDC0003
              </span>
              <span className="text-[10px] font-semibold text-emerald-700">Documento oficial PDF</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Cuadro comparativo y acta de adjudicación</h3>
              <p className="text-xs text-slate-500 leading-relaxed mt-1">
                Incluye ofertas, puntajes, montos, plazos, sustentabilidad, resolución de adjudicación y firmas institucionales configuradas.
              </p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl space-y-2 text-xs border border-slate-200">
              <div className="flex items-center gap-2 text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Una sola versión oficial, vinculada a la ficha.</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span>Firmantes y umbrales tomados de la configuración SGC.</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setActaAbierta(true)}
            disabled={cotizacionesProyecto.length === 0}
            className="w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white"
          >
            <Printer className="w-4 h-4" />
            <span>Abrir acta oficial / Exportar PDF</span>
          </button>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded border border-emerald-200">
              Plantilla para proveedores
            </span>
            <h3 className="text-base font-bold text-slate-800">Formulario estándar de cotización</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              Planilla Excel estructurada para recibir ofertas y permitir su lectura automática por el sistema.
            </p>
          </div>
          <button
            onClick={() => generarPlantillaCotizacionExcel(licitacion)}
            className="w-full py-3 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
          >
            <Download className="w-4 h-4" />
            <span>Descargar plantilla de cotización (.xlsx)</span>
          </button>
        </div>
      </div>

      <FirmaDigitalActaPanel licitacion={licitacion} configFirmas={configFirmas} onOpenActa={() => setActaAbierta(true)} />

      {actaAbierta && (
        <ActaEvaluacionModal
          licitacion={licitacion}
          cotizaciones={cotizaciones}
          proveedores={proveedores}
          configFirmas={configFirmas}
          onClose={() => setActaAbierta(false)}
          onAdjudicar={(proveedorId, justificacion) => {
            void onAdjudicarLicitacion(licitacion.id, proveedorId, justificacion);
            setActaAbierta(false);
          }}
        />
      )}
    </div>
  );
};

type RolFirma = 'director' | 'subdirector' | 'responsable' | 'vrae';

async function calcularSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function FirmaDigitalActaPanel({ licitacion, configFirmas, onOpenActa }: {
  licitacion: LicitacionProyecto;
  configFirmas: ConfiguracionFirmas;
  onOpenActa: () => void;
}) {
  const { user, profile, isAdmin } = useAuth();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const monto = licitacion.montoAdjudicadoTotal || 0;
  const requiereVrae = monto > (configFirmas.parametrosSgc?.umbralAprobacionVrae ?? 5000001);
  const roles: { id: RolFirma; nombre: string; cargo: string; email?: string }[] = [
    { id: 'director', ...configFirmas.directorGestionCampus },
    { id: 'subdirector', ...configFirmas.subdirectorInfraestructura },
    {
      id: 'responsable',
      nombre: licitacion.responsableNombre || configFirmas.responsableDesarrollo.nombre,
      cargo: configFirmas.responsableDesarrollo.cargo,
      email: licitacion.responsableEmail || configFirmas.responsableDesarrollo.email,
    },
    ...(requiereVrae ? [{ id: 'vrae' as RolFirma, ...configFirmas.vicerrectorAdministracion }] : []),
  ];
  const firmaActual = licitacion.actaFirmaDigital;
  const emailActual = (profile?.email || user?.email || '').toLowerCase();
  const rolPorEmail = roles.find(rol => rol.email?.toLowerCase() === emailActual)?.id;
  const rolPendiente = roles.find(rol => !firmaActual?.firmas.some(firma => firma.rolFirma === rol.id))?.id || roles[0].id;
  const [rolSeleccionado, setRolSeleccionado] = useState<RolFirma>(rolPorEmail || rolPendiente);
  const puedeFirmar = Boolean(user) && (isAdmin || profile?.puedeFirmarActas === true || Boolean(rolPorEmail));
  const rolesDisponibles = isAdmin || profile?.puedeFirmarActas === true
    ? roles
    : roles.filter(item => item.id === rolPorEmail);
  const rol = rolesDisponibles.find(item => item.id === rolSeleccionado) || rolesDisponibles[0] || roles[0];
  const completas = roles.every(item => firmaActual?.firmas.some(firma => firma.rolFirma === item.id));

  const subirFirmada = async () => {
    if (!puedeFirmar) return alert('Su usuario no tiene facultad registrada para firmar actas.');
    if (!archivo || (!archivo.name.toLowerCase().endsWith('.pdf') && archivo.type !== 'application/pdf')) {
      return alert('Seleccione el acta firmada en formato PDF.');
    }
    if (!confirm(`¿Confirma que firmó digitalmente en Acrobat en calidad de “${rol.cargo}” y desea registrar esta versión como vigente?`)) return;
    setSubiendo(true);
    try {
      const sha256 = await calcularSha256(archivo);
      const uploaded = await uploadFileToProjectFolder(archivo, licitacion.id, licitacion.nombreProyecto);
      if (uploaded.storage !== 'drive') {
        alert('No se pudo guardar el acta firmada en Drive. Autorice Google Drive e intente nuevamente.');
        return;
      }
      const version = (firmaActual?.version || 0) + 1;
      const identidad = emailActual;
      const firmaNueva = {
        uid: profile?.uid || user!.uid,
        email: identidad,
        nombre: profile?.displayName || rol.nombre || 'Administrador DGDC',
        cargo: profile?.cargoFirma || rol.cargo,
        rolFirma: rol.id,
        fecha: new Date().toISOString(),
        version,
        sha256,
      };
      const firmas = [
        ...(firmaActual?.firmas || []).filter(firma => firma.rolFirma !== rol.id),
        firmaNueva,
      ];
      const estado = roles.every(item => firmas.some(firma => firma.rolFirma === item.id)) ? 'Firmada' as const : 'En firma' as const;
      await updateLicitacion(licitacion.id, {
        actaFirmaDigital: {
          archivoNombre: archivo.name,
          archivoURL: uploaded.url,
          archivoDriveId: uploaded.id,
          version,
          estado,
          fechaActualizacion: new Date().toISOString(),
          sha256,
          firmas,
        },
      });
      setArchivo(null);
      alert(`Acta firmada registrada como versión ${version}. Estado: ${estado}.`);
    } catch (error) {
      console.error('Error registrando acta firmada:', error);
      alert(`No fue posible registrar el acta firmada: ${error instanceof Error ? error.message : 'error desconocido'}`);
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-black flex items-center gap-2"><FileSignature className="w-5 h-5 text-sky-300" /> Firma digital del acta con Adobe Acrobat</h3>
          <p className="text-xs text-slate-300 mt-1">Flujo secuencial con versiones almacenadas en la carpeta Drive de la licitación.</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${completas ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' : 'bg-amber-500/20 text-amber-200 border-amber-400/30'}`}>
          {firmaActual?.estado || 'Pendiente de firmas'} · {firmaActual?.firmas.length || 0}/{roles.length}
        </span>
      </div>

      <div className="p-6 grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 text-xs text-sky-950 space-y-2">
            <p className="font-black">Procedimiento compatible con certificado digital de Acrobat</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Abra el acta y expórtela a PDF; si existe una versión vigente, descárguela desde Drive.</li>
              <li>Firme el PDF en Adobe Acrobat usando “Certificados” o “Rellenar y firmar”.</li>
              <li>Suba el PDF firmado. El sistema conservará el archivo sin modificarlo y registrará su huella digital.</li>
            </ol>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onOpenActa} className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-2"><Printer className="w-4 h-4" /> Abrir acta / Exportar PDF</button>
            {firmaActual?.archivoURL && <a href={firmaActual.archivoURL} target="_blank" rel="noreferrer" className="px-4 py-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2"><ExternalLink className="w-4 h-4" /> Versión vigente {firmaActual.version}</a>}
          </div>
          {firmaActual && <p className="text-[10px] text-slate-500 font-mono break-all">SHA-256 v{firmaActual.version}: {firmaActual.sha256}</p>}
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-slate-700">Estado de firmantes</h4>
          <div className="space-y-2">
            {roles.map(item => {
              const registrada = firmaActual?.firmas.find(firma => firma.rolFirma === item.id);
              return <div key={item.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${registrada ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}><div><strong className="text-xs text-slate-900">{item.nombre}</strong><p className="text-[10px] text-slate-500">{item.cargo}</p></div><span className={`text-[9px] font-black uppercase ${registrada ? 'text-emerald-700' : 'text-amber-700'}`}>{registrada ? `Firmado · v${registrada.version}` : 'Pendiente'}</span></div>;
            })}
          </div>

          {puedeFirmar ? (
            <div className="pt-3 border-t space-y-3">
              <div><label className="text-xs font-bold text-slate-700">Firmar en calidad de</label><select value={rol.id} onChange={e => setRolSeleccionado(e.target.value as RolFirma)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold">{rolesDisponibles.map(item => <option key={item.id} value={item.id}>{item.nombre} — {item.cargo}</option>)}</select></div>
              <label className="block border-2 border-dashed border-sky-200 bg-sky-50/40 rounded-xl p-4 text-center cursor-pointer"><Upload className="w-5 h-5 text-sky-600 mx-auto mb-1" /><span className="text-xs font-bold text-slate-800">{archivo?.name || 'Seleccionar PDF firmado en Acrobat'}</span><input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => setArchivo(e.target.files?.[0] || null)} /></label>
              <button onClick={subirFirmada} disabled={!archivo || subiendo} className="w-full py-2.5 bg-sky-700 hover:bg-sky-600 disabled:bg-slate-300 text-white rounded-xl text-xs font-black flex justify-center items-center gap-2">{subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}{subiendo ? 'Guardando versión firmada...' : 'Registrar firma y guardar en Drive'}</button>
            </div>
          ) : (
            <div className="rounded-xl bg-slate-100 border border-slate-200 p-4 text-xs text-slate-600 flex gap-2"><LockKeyhole className="w-4 h-4 shrink-0" /><span>{user ? 'Su usuario puede consultar el acta, pero no tiene facultad de firma. La autorización se obtiene mediante el rol administrador, el permiso “puedeFirmarActas” o el correo configurado para un firmante oficial.' : 'Debe iniciar sesión con una cuenta institucional facultada para registrar una firma digital.'}</span></div>
          )}
        </div>
      </div>
    </section>
  );
}
