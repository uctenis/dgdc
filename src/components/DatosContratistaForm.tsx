import { Plus, Trash2 } from 'lucide-react';
import type { DatosContratista, RepresentanteLegal } from '../types';
import { PERSONERIA_SUGERIDA, representanteVacio } from '../utils/datosContratista';

interface Props {
  value: DatosContratista;
  onChange: (valor: DatosContratista) => void;
  /** 'oscuro' = portal de proveedores; 'claro' = sistema interno. */
  tema?: 'claro' | 'oscuro';
  disabled?: boolean;
  /** Pide también los datos bancarios de la cuenta donde se pagarán los estados de pago. */
  conBanco?: boolean;
}

const ESTILOS = {
  claro: {
    label: 'block font-semibold text-slate-700 mb-1 text-[11px]',
    input: 'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-sky-500 text-xs disabled:opacity-60',
    nota: 'text-[10px] text-slate-500',
    boton: 'flex items-center gap-1 text-sky-600 hover:text-sky-800 font-semibold text-[11px]',
    quitar: 'p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0',
  },
  oscuro: {
    label: 'block text-xs font-semibold text-sky-300 mb-1.5',
    input: 'w-full px-3 py-2 rounded-xl text-xs text-white outline-none placeholder:text-slate-500 disabled:opacity-50 bg-white/10 border border-white/15',
    nota: 'text-[10px] text-slate-500',
    boton: 'flex items-center gap-1 text-sky-300 hover:text-sky-200 font-semibold text-[11px]',
    quitar: 'p-2 text-slate-400 hover:text-red-400 rounded-lg shrink-0',
  },
} as const;

/** Datos del contratista que exige el contrato: quién lo firma, su domicilio legal y su personería. */
export function DatosContratistaForm({ value, onChange, tema = 'claro', disabled = false, conBanco = false }: Props) {
  const e = ESTILOS[tema];
  const set = (cambios: Partial<DatosContratista>) => onChange({ ...value, ...cambios });
  const setRep = (i: number, cambios: Partial<RepresentanteLegal>) =>
    set({ representantes: value.representantes.map((r, idx) => (idx === i ? { ...r, ...cambios } : r)) });
  const banco = value.datosBancarios || { banco: '', tipoCuenta: 'Cuenta Corriente', numeroCuenta: '', titular: '', rutTitular: '' };

  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-2">
        <label className={e.label}>Representante(s) legal(es) que firman el contrato *</label>
        {value.representantes.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={r.tratamiento}
              disabled={disabled}
              onChange={ev => setRep(i, { tratamiento: ev.target.value as RepresentanteLegal['tratamiento'] })}
              className={`${e.input} !w-20`}
              style={tema === 'oscuro' ? { colorScheme: 'dark' } : undefined}
              title="Tratamiento con que se cita en el contrato"
            >
              <option value="don">don</option>
              <option value="doña">doña</option>
            </select>
            <input
              type="text"
              disabled={disabled}
              value={r.nombre}
              onChange={ev => setRep(i, { nombre: ev.target.value })}
              placeholder="Nombre completo"
              className={`${e.input} flex-1 min-w-[180px]`}
            />
            <input
              type="text"
              disabled={disabled}
              value={r.rut}
              onChange={ev => setRep(i, { rut: ev.target.value })}
              placeholder="Cédula de identidad (12.345.678-9)"
              className={`${e.input} !w-56`}
            />
            {value.representantes.length > 1 && !disabled && (
              <button type="button" onClick={() => set({ representantes: value.representantes.filter((_, idx) => idx !== i) })} className={e.quitar} title="Quitar representante">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {!disabled && value.representantes.length < 4 && (
          <button type="button" onClick={() => set({ representantes: [...value.representantes, representanteVacio()] })} className={e.boton}>
            <Plus className="w-3.5 h-3.5" /> Agregar otro representante (si el contrato lo firman dos o más)
          </button>
        )}
      </div>

      <div>
        <label className={e.label}>Domicilio legal de la empresa *</label>
        <input
          type="text"
          disabled={disabled}
          value={value.domicilioLegal}
          onChange={ev => set({ domicilioLegal: ev.target.value })}
          placeholder="Avenida Holandesa N°0755, Temuco"
          className={e.input}
        />
      </div>

      <div>
        <label className={e.label}>Personería de los representantes *</label>
        <textarea
          rows={3}
          disabled={disabled}
          value={value.personeria}
          onChange={ev => set({ personeria: ev.target.value })}
          placeholder={PERSONERIA_SUGERIDA}
          className={`${e.input} resize-none`}
        />
        <p className={`${e.nota} mt-1`}>
          Documento que acredita su facultad para firmar. Ej.: “{PERSONERIA_SUGERIDA}” o los datos de la escritura pública (notaría, fecha, repertorio).
        </p>
      </div>

      {conBanco && (
        <div className="space-y-2">
          <label className={e.label}>Cuenta bancaria para el pago de los estados de pago (opcional)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input type="text" disabled={disabled} value={banco.banco} onChange={ev => set({ datosBancarios: { ...banco, banco: ev.target.value } })} placeholder="Banco" className={e.input} />
            <select disabled={disabled} value={banco.tipoCuenta} onChange={ev => set({ datosBancarios: { ...banco, tipoCuenta: ev.target.value } })} className={e.input} style={tema === 'oscuro' ? { colorScheme: 'dark' } : undefined}>
              <option>Cuenta Corriente</option>
              <option>Cuenta Vista</option>
              <option>Cuenta de Ahorro</option>
            </select>
            <input type="text" disabled={disabled} value={banco.numeroCuenta} onChange={ev => set({ datosBancarios: { ...banco, numeroCuenta: ev.target.value } })} placeholder="N° de cuenta" className={e.input} />
            <input type="text" disabled={disabled} value={banco.titular} onChange={ev => set({ datosBancarios: { ...banco, titular: ev.target.value } })} placeholder="Titular" className={e.input} />
            <input type="text" disabled={disabled} value={banco.rutTitular} onChange={ev => set({ datosBancarios: { ...banco, rutTitular: ev.target.value } })} placeholder="RUT del titular" className={e.input} />
          </div>
        </div>
      )}
    </div>
  );
}
