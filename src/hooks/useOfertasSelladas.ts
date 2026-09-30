import { useEffect, useState } from 'react';
import { ofertasSelladas } from '../utils/plazoOfertas';
import type { LicitacionProyecto } from '../types';

/** true mientras las ofertas siguen selladas; pasa a false sola a la hora exacta del cierre. */
export function useOfertasSelladas(lic: Pick<LicitacionProyecto, 'fechaEntregaPropuestas' | 'fechaEvaluacion' | 'horaLimiteOfertas'> | null): boolean {
  const [ahora, setAhora] = useState(() => Date.now());
  const sellada = lic ? ofertasSelladas(lic, new Date(ahora)) : false;
  useEffect(() => {
    if (!sellada) return;
    const t = setInterval(() => setAhora(Date.now()), 15000);
    return () => clearInterval(t);
  }, [sellada]);
  return sellada;
}
