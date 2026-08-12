import { useState } from 'react';
import type { LicitacionProyecto, Cotizacion, ConfiguracionFirmas, Proveedor } from '../types';
import { generarPlantillaCotizacionExcel } from '../services/templateGenerator';
import { FileCheck2, Download, CheckCircle2, AlertCircle, Printer, ShieldCheck, FileSignature, Loader2, LockKeyhole } from 'lucide-react';
import { ActaEvaluacionModal } from './ActaEvaluacionModal';
import { useAuth } from '../context/AuthContext';
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

function FirmaDigitalActaPanel({ licitacion, configFirmas, onOpenActa }: {
  licitacion: LicitacionProyecto;
  configFirmas: ConfiguracionFirmas;
  onOpenActa: () => void;
}) {
  const { user, profile, isAdmin } = useAuth();
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState('');

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
  const firmasRegistradas = firmaActual?.firmas || [];
  const completas = roles.every(item => firmasRegistradas.some(firma => firma.rolFirma === item.id));

  const firmarInternamente = async () => {
    if (!user || !puedeFirmar) return alert('Su usuario no tiene facultad registrada para firmar el acta.');
    if (!confirm(`¿Confirma que desea firmar digitalmente el acta en calidad de ${rol.cargo}? Esta acción registrará su identidad de Google y fecha actual.`)) return;
    
    setProcesando(true);
    setMensaje('Registrando su firma segura...');
    try {
      const now = new Date().toISOString();
      // Hash simple para dejar constancia de la integridad
      const datosParaHash = `${licitacion.id}|${user.uid}|${now}`;
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(datosParaHash));
      const sha256 = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');

      const nuevaFirma = {
        uid: user.uid,
        email: emailActual,
        nombre: profile?.displayName || user.displayName || emailActual,
        cargo: rol.cargo,
        rolFirma: rol.id,
        fecha: now,
        version: 1,
        sha256,
      };

      const nuevasFirmas = [...firmasRegistradas.filter(f => f.rolFirma !== rol.id), nuevaFirma];
      const todasLasFirmasListas = roles.every(item => nuevasFirmas.some(firma => firma.rolFirma === item.id));

      await updateLicitacion(licitacion.id, {
        actaFirmaDigital: {
          ...firmaActual,
          version: (firmaActual?.version || 0) + 1,
          estado: todasLasFirmasListas ? 'Firmada' : 'En firma',
          fechaActualizacion: now,
          sha256: firmaActual?.sha256 || 'interno',
          firmas: nuevasFirmas,
        },
      });
      
      setMensaje(`Firma de ${rol.cargo} registrada exitosamente.`);
    } catch (error) {
      console.error('Error al firmar internamente:', error);
      alert('Hubo un error al registrar su firma. Intente nuevamente.');
      setMensaje('');
    } finally {
      setProcesando(false);
    }
  };

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-black flex items-center gap-2"><FileSignature className="w-5 h-5 text-sky-300" /> Validación y Firma Digital</h3>
          <p className="text-xs text-slate-300 mt-1">Firma digital interna usando la identidad de Google del usuario.</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${completas ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' : 'bg-amber-500/20 text-amber-200 border-amber-400/30'}`}>
          {firmaActual?.estado || 'Pendiente de firmas'} · {firmasRegistradas.length}/{roles.length}
        </span>
      </div>

      <div className="p-6 grid lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 text-xs text-sky-950 space-y-2">
            <p className="font-black">Procedimiento de Firma Interna Seguro</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>El sistema verifica su identidad a través de Google Workspace.</li>
              <li>Al presionar "Firmar", su rúbrica digital queda incrustada en la base de datos de la adjudicación.</li>
              <li>El acta se considerará oficialmente válida cuando todas las autoridades requeridas hayan firmado.</li>
            </ol>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={onOpenActa} className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-2"><Printer className="w-4 h-4" /> Ver Acta / Exportar PDF</button>
          </div>
          {mensaje && <p role="status" className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-900">{mensaje}</p>}
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase text-slate-700">Estado de firmantes</h4>
          <div className="space-y-2">
            {roles.map(item => {
              const registrada = firmasRegistradas.find(firma => firma.rolFirma === item.id);
              return (
                <div key={item.id} className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${registrada ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div>
                    <strong className="text-xs text-slate-900">{item.nombre}</strong>
                    <p className="text-[10px] text-slate-500">{item.cargo}</p>
                    {registrada && <p className="text-[9px] text-slate-400 mt-0.5">{new Date(registrada.fecha).toLocaleString()}</p>}
                  </div>
                  <span className={`text-[9px] font-black uppercase ${registrada ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {registrada ? `Firmado v${registrada.version}` : 'Pendiente'}
                  </span>
                </div>
              );
            })}
          </div>

          {puedeFirmar ? (
            <div className="pt-3 border-t space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Firmar en calidad de</label>
                <select value={rol.id} onChange={e => setRolSeleccionado(e.target.value as RolFirma)} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold">
                  {rolesDisponibles.map(item => <option key={item.id} value={item.id}>{item.nombre} — {item.cargo}</option>)}
                </select>
              </div>
              
              {!completas && (
                <button 
                  onClick={firmarInternamente} 
                  disabled={procesando || firmasRegistradas.some(f => f.rolFirma === rol.id)} 
                  className="w-full py-2.5 bg-sky-700 hover:bg-sky-600 disabled:bg-slate-300 text-white rounded-xl text-xs font-black flex justify-center items-center gap-2"
                >
                  {procesando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}
                  {firmasRegistradas.some(f => f.rolFirma === rol.id) ? 'Ya ha firmado en este rol' : 'Firmar Acta Oficialmente'}
                </button>
              )}
              
              {completas && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-xs font-bold text-emerald-900 flex gap-2">
                  <ShieldCheck className="w-5 h-5 shrink-0" /> 
                  El acta ya cuenta con todas las firmas requeridas.
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-slate-100 border border-slate-200 p-4 text-xs text-slate-600 flex gap-2">
              <LockKeyhole className="w-4 h-4 shrink-0" />
              <span>{user ? 'Su usuario puede consultar el acta, pero no tiene facultad de firma.' : 'Debe iniciar sesión con una cuenta institucional facultada para registrar una firma digital.'}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
