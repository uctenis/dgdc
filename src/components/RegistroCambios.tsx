import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download, History } from 'lucide-react';
import { subscribeToAuditoria, type RegistroAuditoria } from '../services/auditoriaService';

/** Nombres legibles de los campos más comunes (el resto se muestra con su nombre técnico). */
const CAMPOS: Record<string, string> = {
  nombreProyecto: 'Nombre del proyecto', nombre: 'Nombre', estado: 'Estado', estadoLifecycle: 'Etapa', descripcion: 'Descripción',
  montoEstimado: 'Monto estimado', valorAprox: 'Valor aproximado', montoAdjudicado: 'Monto adjudicado', montoAdjudicadoTotal: 'Monto adjudicado',
  fechaEvaluacion: 'Cierre de ofertas (evaluación)', fechaEntregaPropuestas: 'Cierre de ofertas', horaLimiteOfertas: 'Hora de cierre',
  fechaVisitaTerreno: 'Visita a terreno', fechaRecepcionConsultas: 'Recepción de consultas', fechaRespuestaConsultas: 'Respuesta de consultas',
  fechaInicioObra: 'Inicio de obra', fechaTerminoProgramada: 'Término programado', responsableNombre: 'Responsable', responsableEmail: 'Correo del responsable',
  proveedoresInvitadosIds: 'Invitados', itemizado: 'Itemizado', presupuesto: 'Aprobación de presupuesto', prioridad: 'Prioridad', bases: 'Bases',
  razonSocial: 'Razón social', rut: 'RUT', email: 'Correo', telefono: 'Teléfono', rubro: 'Rubro', documentos: 'Documentos',
  ordenCompraNumero: 'N° de OC', codigoOP: 'N° de OP', codigoCP: 'Centro de costo', recepcionConforme: 'Recepción conforme',
  firmaResponsable: 'Firma del responsable', factura: 'Factura', devolucionRetenciones: 'Devolución de retenciones', respuesta: 'Respuesta', valor: 'Valor',
};
const nombreCampo = (c: string) => CAMPOS[c] || c;
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Registro de cambios del sistema: quién hizo qué y cuándo, con los valores antes y después. */
export function RegistroCambios() {
  const [registros, setRegistros] = useState<RegistroAuditoria[] | null>(null);
  const [entidad, setEntidad] = useState('');
  const [usuario, setUsuario] = useState('');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [errorLectura, setErrorLectura] = useState(false);

  useEffect(() => subscribeToAuditoria(r => { setRegistros(r); setErrorLectura(false); }, () => { setRegistros([]); setErrorLectura(true); }), []);

  const entidades = useMemo(() => [...new Set((registros || []).map(r => r.entidad))].sort(), [registros]);
  const usuarios = useMemo(() => [...new Set((registros || []).map(r => r.usuario))].sort(), [registros]);
  const filtrados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (registros || []).filter(r =>
      (!entidad || r.entidad === entidad) && (!usuario || r.usuario === usuario)
      && (!t || `${r.nombre || ''} ${r.detalle || ''} ${r.accion} ${r.entidad}`.toLowerCase().includes(t)));
  }, [registros, entidad, usuario, texto]);

  const descargar = () => {
    const filas = [['Fecha', 'Usuario', 'Acción', 'Tipo', 'Registro', 'Detalle', 'Cambios']];
    filtrados.forEach(r => filas.push([
      fechaHora(r.fecha), r.usuario, r.accion, r.entidad, r.nombre || r.entidadId, r.detalle || '',
      Object.entries(r.cambios || {}).map(([c, v]) => `${nombreCampo(c)}: ${v.antes ?? '—'} → ${v.despues ?? '—'}`).join(' | '),
    ]));
    const blob = new Blob(['﻿' + filas.map(f => f.map(csv).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `registro-de-cambios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const campo = 'px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-sky-400';

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2"><History className="w-4 h-4 text-slate-600" /> Registro de cambios</h3>
          <p className="text-[11px] text-slate-500">Quién creó, modificó o eliminó qué, y cuándo. Nadie puede editar ni borrar este registro. Se muestran los últimos 500.</p>
        </div>
        <button type="button" onClick={descargar} disabled={!filtrados.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Download className="w-3.5 h-3.5" /> Descargar (.csv)
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input className={campo} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nombre o detalle…" />
        <select className={campo} value={entidad} onChange={e => setEntidad(e.target.value)} aria-label="Tipo de registro">
          <option value="">Todos los tipos</option>
          {entidades.map(e => <option key={e}>{e}</option>)}
        </select>
        <select className={campo} value={usuario} onChange={e => setUsuario(e.target.value)} aria-label="Usuario">
          <option value="">Todas las personas</option>
          {usuarios.map(u => <option key={u}>{u}</option>)}
        </select>
      </div>

      {registros === null ? (
        <p className="text-xs text-slate-400">Cargando…</p>
      ) : filtrados.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          {errorLectura ? 'No se pudo leer el registro (revise la conexión o los permisos).' : registros.length ? 'Sin cambios con esos filtros.' : 'Aún no hay cambios registrados. Se registran desde ahora.'}
        </p>
      ) : (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {filtrados.map(r => {
            const cambios = Object.entries(r.cambios || {});
            const expandible = cambios.length > 0;
            return (
              <div key={r.id} className="py-2">
                <button
                  type="button"
                  disabled={!expandible}
                  onClick={() => setAbierto(a => (a === r.id ? null : r.id))}
                  className="w-full text-left flex items-start gap-2 disabled:cursor-default"
                >
                  <span className="mt-0.5 text-slate-400 shrink-0">
                    {expandible ? (abierto === r.id ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />) : <span className="inline-block w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-slate-800">
                      <strong>{r.accion}</strong> {r.entidad.toLowerCase()} <span className="font-semibold">{r.nombre || r.entidadId}</span>
                      {expandible && <span className="text-slate-500"> · {[...new Set(cambios.map(([c]) => nombreCampo(c)))].join(', ')}</span>}
                    </span>
                    {r.detalle && <span className="block text-[11px] text-slate-500">{r.detalle}</span>}
                    <span className="block text-[10px] text-slate-400">{fechaHora(r.fecha)} · {r.usuario}</span>
                  </span>
                </button>
                {abierto === r.id && expandible && (
                  <div className="mt-1.5 ml-5 rounded-lg bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-[11px]">
                    {cambios.map(([c, v]) => (
                      <div key={c} className="px-3 py-1.5 grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-3">
                        <span className="font-semibold text-slate-600">{nombreCampo(c)}</span>
                        <span className="text-slate-700 break-words">
                          <span className="text-rose-700 line-through decoration-rose-300">{v.antes ?? '—'}</span>
                          {' → '}
                          <span className="text-emerald-800">{v.despues ?? '—'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
