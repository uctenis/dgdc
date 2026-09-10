import { useEffect, useState } from 'react';
import { X, AlertOctagon, Loader2, Trash2 } from 'lucide-react';
import { contarCarteraYLicitaciones, resetCarteraYLicitaciones } from '../services/firestoreService';

const FRASE_CONFIRMACION = 'BORRAR CARTERA';

interface ResetCarteraModalProps {
  onClose: () => void;
  onCompletado?: () => void;
}

export function ResetCarteraModal({ onClose, onCompletado }: ResetCarteraModalProps) {
  const [cargando, setCargando] = useState(true);
  const [conteo, setConteo] = useState<{ proyectos: number; licitaciones: number; cotizaciones: number } | null>(null);
  const [frase, setFrase] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [resultado, setResultado] = useState<{ proyectos: number; licitaciones: number; cotizaciones: number } | null>(null);

  useEffect(() => {
    contarCarteraYLicitaciones().then(c => {
      setConteo(c);
      setCargando(false);
    });
  }, []);

  const puedeBorrar = frase.trim().toUpperCase() === FRASE_CONFIRMACION;

  const ejecutar = async () => {
    if (!puedeBorrar || !conteo) return;
    if (!confirm(`Última confirmación: se eliminarán ${conteo.proyectos} proyectos, ${conteo.licitaciones} licitaciones y ${conteo.cotizaciones} cotizaciones de forma permanente. ¿Continuar?`)) return;
    setBorrando(true);
    try {
      const r = await resetCarteraYLicitaciones();
      setResultado(r);
      onCompletado?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ocurrió un error al borrar. Revise la consola.');
      console.error('Error en resetCarteraYLicitaciones:', err);
    } finally {
      setBorrando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-rose-200">
        <div className="flex items-center justify-between border-b border-rose-100 pb-4">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-6 h-6 text-rose-600" />
            <h3 className="text-base font-bold text-rose-950">Borrar Cartera y Licitaciones</h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {resultado ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
            <p className="font-bold mb-1">Listo. Se eliminaron:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>{resultado.proyectos} proyectos de la Cartera</li>
              <li>{resultado.licitaciones} licitaciones (con sus estados de pago, aumentos de obra, invitados y propuestas)</li>
              <li>{resultado.cotizaciones} cotizaciones</li>
            </ul>
            <p className="mt-3 text-xs text-emerald-700">Proveedores, configuración de firmas, responsables y usuarios no fueron afectados.</p>
            <button onClick={onClose} className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-900 space-y-2">
              <p className="font-bold">Esta acción es permanente y no se puede deshacer.</p>
              {cargando ? (
                <p className="flex items-center gap-2 text-xs"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Contando registros...</p>
              ) : conteo && (
                <ul className="list-disc pl-5 text-xs space-y-0.5">
                  <li><strong>{conteo.proyectos}</strong> proyectos de la Cartera</li>
                  <li><strong>{conteo.licitaciones}</strong> licitaciones (con sus estados de pago, aumentos de obra, invitados y propuestas)</li>
                  <li><strong>{conteo.cotizaciones}</strong> cotizaciones</li>
                </ul>
              )}
              <p className="text-xs text-rose-700">No se tocan: proveedores, configuración de firmas, responsables ni usuarios.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Escriba <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-rose-700">{FRASE_CONFIRMACION}</span> para habilitar el borrado
              </label>
              <input
                type="text"
                value={frase}
                onChange={e => setFrase(e.target.value)}
                placeholder={FRASE_CONFIRMACION}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium text-xs">Cancelar</button>
              <button
                onClick={ejecutar}
                disabled={!puedeBorrar || borrando || cargando}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-xs flex items-center gap-2"
              >
                {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {borrando ? 'Borrando…' : 'Borrar definitivamente'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
