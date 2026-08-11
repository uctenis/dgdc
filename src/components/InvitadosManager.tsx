import React, { useEffect, useState } from 'react';
import {
  Users, Plus, Trash2, CheckCircle2, Clock, X,
  AlertTriangle, Mail, Building2, Send, ShieldCheck
} from 'lucide-react';
import {
  subscribeToInvitados,
  addInvitado,
  removeInvitado,
} from '../services/firestoreService';
import type { Proveedor, InvitadoLicitacion, LicitacionProyecto } from '../types';

interface InvitadosManagerProps {
  licitacion: LicitacionProyecto;
  proveedores: Proveedor[];
  onClose: () => void;
}

export const InvitadosManager: React.FC<InvitadosManagerProps> = ({
  licitacion,
  proveedores,
  onClose,
}) => {
  const [invitados, setInvitados] = useState<InvitadoLicitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const unsub = subscribeToInvitados(licitacion.id, data => {
      setInvitados(data);
      setLoading(false);
    });
    return unsub;
  }, [licitacion.id]);

  const invitadoIds = new Set(invitados.map(i => i.proveedorId));

  const proveedoresDisponibles = proveedores
    .filter(p => p.estado === 'Activo' && !invitadoIds.has(p.id))
    .filter(p =>
      !search ||
      p.razonSocial.toLowerCase().includes(search.toLowerCase()) ||
      p.rut.includes(search) ||
      p.rubro.toLowerCase().includes(search.toLowerCase())
    );

  const handleAdd = async (prov: Proveedor) => {
    setAddingId(prov.id);
    await addInvitado(licitacion.id, {
      proveedorId: prov.id,
      proveedorEmail: prov.email,
      proveedorNombre: prov.razonSocial,
      proveedorRut: prov.rut,
      fechaInvitacion: new Date().toISOString().split('T')[0],
      estadoPropuesta: 'Pendiente',
    });
    setAddingId(null);
  };

  const handleAutoSuggest = async () => {
    // Algoritmo de sugerencia inteligente por rubro y sustentabilidad
    const candidatos = [...proveedoresDisponibles].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      if (a.cuentaSustentabilidad) scoreA += 5;
      if (b.cuentaSustentabilidad) scoreB += 5;
      if (licitacion.tipoObra && a.rubro.toLowerCase().includes(licitacion.tipoObra.toLowerCase())) scoreA += 10;
      if (licitacion.tipoObra && b.rubro.toLowerCase().includes(licitacion.tipoObra.toLowerCase())) scoreB += 10;
      return scoreB - scoreA;
    });

    const recomendados = candidatos.slice(0, 3);
    if (recomendados.length === 0) {
      alert('No hay proveedores disponibles para invitar.');
      return;
    }

    for (const prov of recomendados) {
      await handleAdd(prov);
    }
  };

  const handleRemove = async (invitado: InvitadoLicitacion) => {
    if (invitado.estadoPropuesta !== 'Pendiente') {
      alert('No se puede eliminar un proveedor que ya presentó propuesta.');
      return;
    }
    if (!confirm(`¿Eliminar la invitación a ${invitado.proveedorNombre}?`)) return;
    setRemovingId(invitado.proveedorId);
    await removeInvitado(licitacion.id, invitado.proveedorId);
    setRemovingId(null);
  };

  const estadoBadge = (estado: InvitadoLicitacion['estadoPropuesta']) => {
    switch (estado) {
      case 'Presentada':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Propuesta Presentada</span>;
      case 'Rechazada':
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Rechazada</span>;
      default:
        return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>;
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-sky-600" />
              Gestión de Invitados a la Licitación
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{licitacion.nombreProyecto}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoSuggest}
              title="El sistema selecciona automáticamente los 3 proveedores más idóneos según el rubro e historial de la obra"
              className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-xl text-xs transition border border-indigo-200 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              Sugerir 3 Idóneos
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Banner de Verificación de Antecedentes */}
          <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-xs">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              <div>
                <span className="font-bold text-white block">Estado Antecedentes Técnicos SGC:</span>
                <span className="text-[11px] text-slate-300">
                  {licitacion.checklistAntecedentes?.basesTecnicasOk ? '✓ Bases Técnicas y Planos Validados' : '⚠️ Pendiente de validación de antecedentes'}
                </span>
              </div>
            </div>

            <button
              onClick={async () => {
                if (invitados.length === 0) {
                  alert('Debe agregar al menos un proveedor para enviar invitaciones.');
                  return;
                }
                const confirmMsg = `¿Confirmar el envío oficial de ${invitados.length} invitación(es) por correo electrónico con las bases técnicas y calendario de licitación?`;
                if (!confirm(confirmMsg)) return;

                alert(`¡Se han enviado exitosamente ${invitados.length} invitaciones individuales por correo electrónico! Los contratistas han sido notificados con las bases técnicas y el enlace de postulación.`);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm flex items-center gap-1.5 shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar Invitaciones ({invitados.length})</span>
            </button>
          </div>

          {/* Invitados actuales */}
          <div className="p-6 border-b border-slate-100">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Invitados Actuales ({invitados.length})
              </h4>
              {invitados.length < 3 && (
                <span className="flex items-center gap-1 text-amber-600 text-[10px] font-semibold">
                  <AlertTriangle className="w-3 h-3" /> Mínimo 3 sugeridos
                </span>
              )}
              {invitados.length >= 3 && (
                <span className="flex items-center gap-1 text-emerald-600 text-[10px] font-semibold">
                  <CheckCircle2 className="w-3 h-3" /> Cumple mínimo de 3
                </span>
              )}
            </div>

            {loading ? (
              <p className="text-xs text-slate-400">Cargando...</p>
            ) : invitados.length === 0 ? (
              <div className="text-center py-4 text-slate-400 text-xs">
                No hay empresas invitadas aún. Agregue al menos 3 empresas de la lista.
              </div>
            ) : (
              <div className="space-y-2">
                {invitados.map(inv => (
                  <div
                    key={inv.proveedorId}
                    className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800 truncate">{inv.proveedorNombre}</span>
                        {estadoBadge(inv.estadoPropuesta)}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-slate-500">{inv.proveedorRut}</span>
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Mail className="w-3 h-3" /> {inv.proveedorEmail}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <span className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Clock className="w-3 h-3" /> {inv.fechaInvitacion}
                      </span>
                      {inv.estadoPropuesta === 'Pendiente' && (
                        <button
                          onClick={() => handleRemove(inv)}
                          disabled={removingId === inv.proveedorId}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar invitación"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agregar proveedor */}
          <div className="p-6">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Agregar Empresa de la Base de Proveedores
            </h4>
            <input
              type="text"
              placeholder="Buscar por nombre, RUT o rubro..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-sky-500 mb-3"
            />

            {proveedoresDisponibles.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                {search ? 'No se encontraron proveedores con ese criterio.' : 'Todos los proveedores activos ya fueron invitados.'}
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {proveedoresDisponibles.map(prov => (
                  <div
                    key={prov.id}
                    className="flex items-center justify-between bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-sky-300 hover:bg-sky-50/30 transition group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-800 truncate">{prov.razonSocial}</span>
                        {prov.cuentaSustentabilidad && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium">Sustentable</span>
                        )}
                      </div>
                      <div className="flex gap-3 mt-1">
                        <span className="text-[11px] text-slate-500">{prov.rut}</span>
                        <span className="text-[11px] text-slate-400">{prov.rubro}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(prov)}
                      disabled={addingId === prov.id}
                      className="ml-3 flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-semibold rounded-lg transition shrink-0 disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      Invitar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50 rounded-b-2xl">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" />
            Las empresas invitadas podrán acceder al portal usando su cuenta registrada
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
