import { getRubrosList } from '../data/rubrosData';
import { obtenerRubrosSugeridos, obtenerRubroPrincipal } from '../data/tiposObraData';

interface Props {
  tipoObra?: string;
  value: string;
  onChange: (rubro: string) => void;
  className?: string;
  disabled?: boolean;
  /** Texto de la opción vacía. */
  placeholder?: string;
}

/**
 * Selector de Rubro que muestra primero los rubros sugeridos para el Tipo de Obra elegido
 * (catálogo editable en Configuración → Tipos de Obra) y luego el resto. No obliga: se puede
 * elegir cualquier rubro activo.
 */
export function RubroSelect({ tipoObra, value, onChange, className, disabled, placeholder = 'Seleccione un rubro…' }: Props) {
  const activos = getRubrosList().filter(r => r.estado === 'Activo').map(r => r.nombre);
  const sugeridos = obtenerRubrosSugeridos(tipoObra).filter(n => activos.includes(n));
  const otros = activos.filter(n => !sugeridos.includes(n));
  // Si el proyecto tiene un rubro que ya no está en el catálogo, se muestra igual para no perderlo.
  const huerfano = value && !activos.includes(value) ? value : null;

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={className} disabled={disabled}>
      <option value="">{placeholder}</option>
      {huerfano && <option value={huerfano}>{huerfano} (fuera del catálogo)</option>}
      {sugeridos.length > 0 ? (
        <>
          <optgroup label={`Sugeridos para ${tipoObra}`}>
            {sugeridos.map((n, i) => (
              <option key={n} value={n}>{i === 0 && obtenerRubroPrincipal(tipoObra) === n ? `★ ${n}` : n}</option>
            ))}
          </optgroup>
          <optgroup label="Otros rubros">
            {otros.map(n => <option key={n} value={n}>{n}</option>)}
          </optgroup>
        </>
      ) : (
        activos.map(n => <option key={n} value={n}>{n}</option>)
      )}
    </select>
  );
}
