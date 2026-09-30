import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, Download, FileUp, Leaf, Loader2, Save, Send, ShieldX } from 'lucide-react';
import { getInscripcion, guardarInscripcion } from '../services/firestoreService';
import { uploadDocumentoInscripcion } from '../services/storageService';
import { formatearRUT, validarRUT } from '../utils/rutUtils';
import { getRubrosList } from '../data/rubrosData';
import { FORMULARIOS_ADHESION, REQUISITOS_INSCRIPCION, diasDesdeEmision } from '../data/inscripcionProveedores';
import type { DocumentoInscripcion, InscripcionProveedor } from '../types';

type Datos = NonNullable<InscripcionProveedor['datos']>;

const datosVacios = (razonSocial = '', email = ''): Datos => ({
  rut: '', razonSocial, giro: '', rubro: '', nombreContacto: '', email, telefono: '', direccion: '', ciudad: '',
  representanteLegal: '', rutRepresentante: '',
  datosBancarios: { banco: '', tipoCuenta: 'Cuenta Corriente', numeroCuenta: '', titular: '', rutTitular: '' },
});

const normalizarRut = (r: string) => r.replace(/[^0-9kK]/g, '').toUpperCase();

/**
 * Inscripción como proveedor de la UCT (/proveedores/inscripcion?t=código). Solo se llega con el enlace personal
 * que envía la UCT: la empresa completa sus datos y sube los requisitos, y la UCT los revisa.
 */
export function InscripcionProveedorPage() {
  const [codigo] = useState(() => new URLSearchParams(window.location.search).get('t') || '');
  const [inscripcion, setInscripcion] = useState<InscripcionProveedor | null | undefined>(undefined);
  const [datos, setDatos] = useState<Datos>(datosVacios());
  const [documentos, setDocumentos] = useState<Record<string, DocumentoInscripcion>>({});
  const [sustentable, setSustentable] = useState(false);
  const [descSustentable, setDescSustentable] = useState('');
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errores, setErrores] = useState<string[]>([]);
  const [formulariosDisponibles, setFormulariosDisponibles] = useState<Record<string, boolean>>({});

  // Solo servidor local: ?t=demo muestra el formulario con una inscripción de ejemplo (no guarda nada).
  const demo = import.meta.env.DEV && codigo === 'demo';

  useEffect(() => {
    if (!codigo) { setInscripcion(null); return; }
    (demo
      ? Promise.resolve<InscripcionProveedor>({ id: 'demo', razonSocialInvitada: 'Constructora Los Robles SpA', emailInvitado: 'contacto@losrobles.cl', invitadaPor: 'UCT', fechaInvitacion: new Date().toISOString(), estado: 'Invitada' })
      : getInscripcion(codigo))
      .then(ins => {
        setInscripcion(ins);
        if (!ins) return;
        setDatos({ ...datosVacios(ins.razonSocialInvitada, ins.emailInvitado), ...(ins.datos || {}) });
        setDocumentos(ins.documentos || {});
        setSustentable(Boolean(ins.sustentabilidad?.declara));
        setDescSustentable(ins.sustentabilidad?.descripcion || '');
      })
      .catch(() => setInscripcion(null));
  }, [codigo, demo]);

  // Los formularios de adhesión se ofrecen para descargar solo si están publicados en el sitio.
  useEffect(() => {
    FORMULARIOS_ADHESION.forEach(f => {
      fetch(`${import.meta.env.BASE_URL}${f.archivo}`, { method: 'HEAD' })
        .then(r => setFormulariosDisponibles(prev => ({ ...prev, [f.id]: r.ok && !(r.headers.get('content-type') || '').includes('text/html') })))
        .catch(() => undefined);
    });
  }, []);

  const rubros = useMemo(() => getRubrosList().map(r => r.nombre).sort(), []);
  const editable = inscripcion?.estado === 'Invitada' || inscripcion?.estado === 'Observada';

  const set = (campo: keyof Datos, valor: string) => setDatos(d => ({ ...d, [campo]: valor }));
  const setBanco = (campo: keyof Datos['datosBancarios'], valor: string) => setDatos(d => ({ ...d, datosBancarios: { ...d.datosBancarios, [campo]: valor } }));

  const subir = async (requisito: string, file: File | undefined) => {
    if (!file || !codigo) return;
    if (demo) {
      setDocumentos(d => ({ ...d, [requisito]: { nombre: file.name, url: URL.createObjectURL(file), fechaCarga: new Date().toISOString() } }));
      return;
    }
    if (file.size > 15 * 1024 * 1024) { setMensaje('El archivo supera los 15 MB.'); return; }
    if (!/^(application\/pdf|image\/)/.test(file.type)) { setMensaje('Suba el documento en PDF o como imagen.'); return; }
    setSubiendo(requisito);
    setMensaje('');
    try {
      const url = await uploadDocumentoInscripcion(codigo, requisito, file);
      const nuevos = { ...documentos, [requisito]: { ...documentos[requisito], nombre: file.name, url, fechaCarga: new Date().toISOString() } };
      setDocumentos(nuevos);
      await guardarInscripcion(codigo, { datos, documentos: nuevos, sustentabilidad: { declara: sustentable, descripcion: descSustentable } }, false);
    } catch (err) {
      console.error('Error subiendo el documento:', err);
      setMensaje('No se pudo subir el documento. Revise su conexión e intente nuevamente.');
    } finally {
      setSubiendo(null);
    }
  };

  const setFechaEmision = (requisito: string, fecha: string) =>
    setDocumentos(d => (d[requisito] ? { ...d, [requisito]: { ...d[requisito], fechaEmision: fecha } } : d));

  const validar = (): string[] => {
    const faltan: string[] = [];
    if (!validarRUT(datos.rut).esValido) faltan.push('RUT de la empresa válido');
    const obligatorios: [keyof Datos, string][] = [['razonSocial', 'razón social'], ['giro', 'giro'], ['rubro', 'rubro'], ['representanteLegal', 'representante legal'],
      ['nombreContacto', 'nombre de contacto'], ['telefono', 'teléfono'], ['direccion', 'dirección'], ['ciudad', 'ciudad']];
    obligatorios.forEach(([c, n]) => { if (!String(datos[c] || '').trim()) faltan.push(n); });
    if (!validarRUT(datos.rutRepresentante).esValido) faltan.push('RUT del representante legal válido');
    if (!datos.email.includes('@')) faltan.push('correo de contacto');
    const b = datos.datosBancarios;
    if (!b.banco.trim() || !b.numeroCuenta.trim() || !b.titular.trim()) faltan.push('cuenta bancaria completa');
    if (normalizarRut(b.rutTitular) !== normalizarRut(datos.rut)) faltan.push('cuenta bancaria a nombre del mismo RUT de la empresa');
    REQUISITOS_INSCRIPCION.filter(r => !r.opcional).forEach(r => {
      const d = documentos[r.id];
      if (!d) { faltan.push(r.nombre); return; }
      if (r.vigenciaDias) {
        if (!d.fechaEmision) faltan.push(`fecha de emisión de ${r.nombre}`);
        else if (diasDesdeEmision(d.fechaEmision) > r.vigenciaDias) faltan.push(`${r.nombre} con máximo ${r.vigenciaDias} días de emitido`);
      }
    });
    return faltan;
  };

  const guardar = async (enviar: boolean) => {
    if (!codigo) return;
    setMensaje('');
    if (enviar) {
      const faltan = validar();
      setErrores(faltan);
      if (faltan.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      if (!confirm('¿Enviar la inscripción a revisión de la UCT? Después no podrá modificarla, salvo que la UCT le pida correcciones.')) return;
    }
    if (demo) { setMensaje('Demostración: no se guarda nada.'); if (enviar) setInscripcion(i => (i ? { ...i, estado: 'Enviada' } : i)); return; }
    setGuardando(true);
    try {
      const limpio = { ...datos, rut: formatearRUT(datos.rut), rutRepresentante: formatearRUT(datos.rutRepresentante), datosBancarios: { ...datos.datosBancarios, rutTitular: formatearRUT(datos.datosBancarios.rutTitular) } };
      await guardarInscripcion(codigo, { datos: limpio, documentos, sustentabilidad: { declara: sustentable, ...(descSustentable.trim() ? { descripcion: descSustentable.trim() } : {}) } }, enviar);
      if (enviar) setInscripcion(i => (i ? { ...i, estado: 'Enviada', fechaEnvio: new Date().toISOString() } : i));
      setMensaje(enviar ? '' : 'Avance guardado. Puede volver con el mismo enlace para terminar.');
    } catch (err) {
      console.error('Error guardando la inscripción:', err);
      setMensaje('No se pudo guardar. Revise su conexión e intente nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  if (inscripcion === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500 gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Cargando…</div>;
  }
  if (inscripcion === null) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-100">
        <div className="max-w-md bg-white rounded-2xl shadow p-8 text-center space-y-3">
          <ShieldX className="w-10 h-10 text-slate-400 mx-auto" />
          <h1 className="text-lg font-bold text-slate-800">Enlace no válido</h1>
          <p className="text-sm text-slate-600">La inscripción como proveedor de la UCT es solo por invitación. Use el enlace personal que le enviaron desde la Universidad.</p>
        </div>
      </div>
    );
  }

  const campo = 'w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:bg-slate-50 disabled:text-slate-500';
  const etiqueta = 'block text-xs font-semibold text-slate-600 mb-1';
  const rutValido = !datos.rut || validarRUT(datos.rut).esValido;
  const grupos = [...new Set(REQUISITOS_INSCRIPCION.map(r => r.grupo))];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-gradient-to-r from-slate-900 via-blue-950 to-sky-900 text-white">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Building2 className="w-6 h-6 text-sky-300" /></div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-sky-300 font-semibold">Universidad Católica de Temuco</p>
            <h1 className="text-lg sm:text-xl font-black">Inscripción como proveedor</h1>
            <p className="text-xs text-slate-300">{inscripcion.razonSocialInvitada}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-3 sm:px-4 py-5 space-y-4">
        {inscripcion.estado === 'Enviada' && (
          <Aviso tono="ok" titulo="Inscripción enviada">La UCT revisará sus antecedentes y se comunicará con usted al correo {datos.email}.</Aviso>
        )}
        {inscripcion.estado === 'Observada' && (
          <Aviso tono="alerta" titulo="La UCT solicita correcciones">{inscripcion.observaciones} Corrija lo indicado y vuelva a enviar.</Aviso>
        )}
        {(inscripcion.estado === 'Aprobada' || inscripcion.estado === 'Solicitada a Adquisiciones' || inscripcion.estado === 'Registrada') && (
          <Aviso tono="ok" titulo="Inscripción aprobada">Sus antecedentes fueron aprobados{inscripcion.estado === 'Registrada' ? ' y su empresa ya figura en el registro oficial de proveedores de la UCT' : '; la Unidad de Adquisiciones completará su registro oficial'}.</Aviso>
        )}
        {inscripcion.estado === 'Rechazada' && (
          <Aviso tono="error" titulo="Inscripción no aprobada">{inscripcion.observaciones}</Aviso>
        )}
        {errores.length > 0 && editable && (
          <Aviso tono="error" titulo="Falta completar antes de enviar">
            <ul className="list-disc pl-4 space-y-0.5">{errores.map(e => <li key={e}>{e}</li>)}</ul>
          </Aviso>
        )}

        {editable && (
          <p className="text-sm text-slate-600">
            Complete los datos de su empresa y suba los documentos solicitados. Todos son <strong>requisitos mínimos excluyentes</strong>, salvo el de sustentabilidad, que es un factor favorable.
            Puede guardar su avance y volver con este mismo enlace.
          </p>
        )}

        <Seccion titulo="Datos de la empresa">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta}>RUT de la empresa *</label>
              <input className={`${campo} ${rutValido ? '' : 'border-red-400'}`} disabled={!editable} value={datos.rut} onChange={e => set('rut', e.target.value)} onBlur={e => set('rut', formatearRUT(e.target.value))} placeholder="76.123.456-7" />
              {!rutValido && <p className="text-[11px] text-red-600 mt-0.5">RUT no válido: revise el dígito verificador.</p>}
            </div>
            <div><label className={etiqueta}>Razón social *</label><input className={campo} disabled={!editable} value={datos.razonSocial} onChange={e => set('razonSocial', e.target.value)} /></div>
            <div><label className={etiqueta}>Giro *</label><input className={campo} disabled={!editable} value={datos.giro} onChange={e => set('giro', e.target.value)} placeholder="Como figura en el SII" /></div>
            <div>
              <label className={etiqueta}>Rubro en que se inscribe *</label>
              <select className={campo} disabled={!editable} value={datos.rubro} onChange={e => set('rubro', e.target.value)}>
                <option value="">— Seleccione —</option>
                {rubros.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div><label className={etiqueta}>Representante legal *</label><input className={campo} disabled={!editable} value={datos.representanteLegal} onChange={e => set('representanteLegal', e.target.value)} /></div>
            <div><label className={etiqueta}>RUT del representante legal *</label><input className={campo} disabled={!editable} value={datos.rutRepresentante} onChange={e => set('rutRepresentante', e.target.value)} onBlur={e => set('rutRepresentante', formatearRUT(e.target.value))} /></div>
            <div><label className={etiqueta}>Nombre de contacto *</label><input className={campo} disabled={!editable} value={datos.nombreContacto} onChange={e => set('nombreContacto', e.target.value)} /></div>
            <div><label className={etiqueta}>Correo de contacto *</label><input type="email" className={campo} disabled={!editable} value={datos.email} onChange={e => set('email', e.target.value)} /></div>
            <div><label className={etiqueta}>Teléfono *</label><input className={campo} disabled={!editable} value={datos.telefono} onChange={e => set('telefono', e.target.value)} placeholder="+56 9 …" /></div>
            <div><label className={etiqueta}>Ciudad *</label><input className={campo} disabled={!editable} value={datos.ciudad} onChange={e => set('ciudad', e.target.value)} /></div>
            <div className="sm:col-span-2"><label className={etiqueta}>Dirección *</label><input className={campo} disabled={!editable} value={datos.direccion} onChange={e => set('direccion', e.target.value)} /></div>
          </div>
        </Seccion>

        <Seccion titulo="Cuenta bancaria para pagos">
          <p className="text-xs text-slate-500 mb-2">Según los Términos y Condiciones de Compra (2.5), la UCT paga solo a una cuenta a nombre del mismo RUT de la empresa.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={etiqueta}>Banco *</label><input className={campo} disabled={!editable} value={datos.datosBancarios.banco} onChange={e => setBanco('banco', e.target.value)} /></div>
            <div>
              <label className={etiqueta}>Tipo de cuenta *</label>
              <select className={campo} disabled={!editable} value={datos.datosBancarios.tipoCuenta} onChange={e => setBanco('tipoCuenta', e.target.value)}>
                {['Cuenta Corriente', 'Cuenta Vista', 'Cuenta de Ahorro'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div><label className={etiqueta}>N° de cuenta *</label><input className={campo} disabled={!editable} value={datos.datosBancarios.numeroCuenta} onChange={e => setBanco('numeroCuenta', e.target.value)} /></div>
            <div><label className={etiqueta}>Titular *</label><input className={campo} disabled={!editable} value={datos.datosBancarios.titular} onChange={e => setBanco('titular', e.target.value)} /></div>
            <div>
              <label className={etiqueta}>RUT del titular *</label>
              <input className={campo} disabled={!editable} value={datos.datosBancarios.rutTitular} onChange={e => setBanco('rutTitular', e.target.value)} onBlur={e => setBanco('rutTitular', formatearRUT(e.target.value))} />
              {datos.datosBancarios.rutTitular && datos.rut && normalizarRut(datos.datosBancarios.rutTitular) !== normalizarRut(datos.rut) && (
                <p className="text-[11px] text-amber-700 mt-0.5">Debe ser el mismo RUT de la empresa.</p>
              )}
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Documentos solicitados">
          {FORMULARIOS_ADHESION.some(f => formulariosDisponibles[f.id]) && (
            <div className="flex flex-wrap gap-2 mb-3">
              {FORMULARIOS_ADHESION.filter(f => formulariosDisponibles[f.id]).map(f => (
                <a key={f.id} href={`${import.meta.env.BASE_URL}${f.archivo}`} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-sky-200 bg-sky-50 text-xs font-bold text-sky-800 hover:bg-sky-100">
                  <Download className="w-3.5 h-3.5" /> Descargar {f.nombre}
                </a>
              ))}
            </div>
          )}
          <div className="space-y-4">
            {grupos.map(g => (
              <div key={g} className="space-y-2">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500 flex items-center gap-1.5">{g.includes('sustentabilidad') && <Leaf className="w-3.5 h-3.5 text-emerald-600" />}{g}</p>
                {REQUISITOS_INSCRIPCION.filter(r => r.grupo === g).map(r => {
                  const d = documentos[r.id];
                  const dias = d?.fechaEmision ? diasDesdeEmision(d.fechaEmision) : undefined;
                  const vencido = r.vigenciaDias !== undefined && dias !== undefined && dias > r.vigenciaDias;
                  return (
                    <div key={r.id} className="rounded-xl border border-slate-200 p-3 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-800">{r.nombre}{!r.opcional && ' *'}</p>
                          <p className="text-[11px] text-slate-500">{r.ayuda}{r.vigenciaDias ? ` Máximo ${r.vigenciaDias} días de vigencia.` : ''}</p>
                        </div>
                        {d && <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Cargado</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {editable && (
                          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer">
                            {subiendo === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileUp className="w-3.5 h-3.5" />}
                            {d ? 'Reemplazar' : 'Subir archivo'}
                            <input type="file" accept="application/pdf,image/*" className="hidden" disabled={Boolean(subiendo)} onChange={e => { void subir(r.id, e.target.files?.[0]); e.target.value = ''; }} />
                          </label>
                        )}
                        {d && <a href={d.url} target="_blank" rel="noreferrer" className="text-xs text-sky-700 hover:underline truncate max-w-[220px]">{d.nombre}</a>}
                        {d && r.vigenciaDias && (
                          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                            Emitido el
                            <input type="date" disabled={!editable} className="px-2 py-1 rounded-lg border border-slate-300 text-xs" value={d.fechaEmision || ''} onChange={e => setFechaEmision(r.id, e.target.value)} />
                          </label>
                        )}
                      </div>
                      {vencido && <p className="text-[11px] font-semibold text-red-600">Tiene {dias} días de emitido: suba uno con máximo {r.vigenciaDias} días.</p>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" disabled={!editable} checked={sustentable} onChange={e => setSustentable(e.target.checked)} />
            Mi empresa tiene una política o práctica de sustentabilidad
          </label>
          {sustentable && (
            <textarea className={`${campo} mt-2`} rows={2} disabled={!editable} value={descSustentable} onChange={e => setDescSustentable(e.target.value)} placeholder="Ej: reciclaje de residuos de obra, certificación ambiental, uso de materiales sustentables…" />
          )}
        </Seccion>

        {mensaje && <p className="text-sm font-semibold text-slate-700">{mensaje}</p>}
        {editable && (
          <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pb-8">
            <button type="button" disabled={guardando} onClick={() => void guardar(false)} className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-700 disabled:opacity-60">
              <Save className="w-4 h-4" /> Guardar avance
            </button>
            <button type="button" disabled={guardando} onClick={() => void guardar(true)} className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold disabled:opacity-60">
              {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Enviar a revisión
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <h2 className="text-sm font-black text-slate-800 mb-3">{titulo}</h2>
      {children}
    </section>
  );
}

function Aviso({ tono, titulo, children }: { tono: 'ok' | 'alerta' | 'error'; titulo: string; children: React.ReactNode }) {
  const estilo = tono === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : tono === 'alerta' ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-red-50 border-red-300 text-red-900';
  const Icono = tono === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${estilo}`}>
      <p className="font-bold flex items-center gap-2"><Icono className="w-4 h-4" /> {titulo}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
