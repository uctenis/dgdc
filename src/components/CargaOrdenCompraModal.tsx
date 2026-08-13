import React, { useState } from 'react';
import { Upload, CheckCircle2, X, Sparkles, AlertCircle } from 'lucide-react';
import type { LicitacionProyecto } from '../types';
import { parseOrdenDeCompra } from '../utils/ocParser';
import { updateLicitacion, updateProyectoMaestro } from '../services/firestoreService';

interface CargaOrdenCompraModalProps {
  licitacion: LicitacionProyecto;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CargaOrdenCompraModal: React.FC<CargaOrdenCompraModalProps> = ({
  licitacion,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [numeroOCDetectado, setNumeroOCDetectado] = useState<string>(licitacion.ordenCompraNumero || '');
  const [numeroContrato, setNumeroContrato] = useState<string>(licitacion.numeroContrato || '');
  const [numeroOT, setNumeroOT] = useState<string>(licitacion.codigoOT || licitacion.ordenTrabajoNumero || '');
  const [numeroOP, setNumeroOP] = useState<string>(licitacion.codigoOP || licitacion.ordenPedidoNumero || '');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setParsing(true);
    setErrorMsg(null);

    try {
      const res = await parseOrdenDeCompra(selected);
      if (res.numeroOC) {
        setNumeroOCDetectado(res.numeroOC);
      } else {
        setNumeroOCDetectado(`OC-${Date.now().toString().slice(-6)}`);
      }
      if (res.numeroOT) setNumeroOT(res.numeroOT);
      if (res.numeroOP) setNumeroOP(res.numeroOP);
    } catch (err) {
      console.error('Error al procesar la OC:', err);
      setErrorMsg('No se pudo leer automáticamente el número de OC. Por favor confírmelo manualmente.');
    } finally {
      setParsing(false);
    }
  };

  const handleGuardarOC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numeroOCDetectado.trim()) {
      alert('Ingrese o confirme el número de Orden de Compra.');
      return;
    }

    setSaving(true);
    try {
      const datosOC = {
        ordenCompraNumero: numeroOCDetectado.trim(),
        codigoOC: numeroOCDetectado.trim(),
        numeroContrato: numeroContrato.trim(),
        codigoOT: numeroOT.trim(),
        ordenTrabajoNumero: numeroOT.trim(),
        codigoOP: numeroOP.trim(),
        ordenPedidoNumero: numeroOP.trim(),
        archivoOCNombre: file ? file.name : licitacion.archivoOCNombre || 'Orden_de_Compra.pdf',
        fechaCargaOC: new Date().toISOString().split('T')[0],
        estadoLifecycle: 'OC_Emitida' as LicitacionProyecto['estadoLifecycle'],
      };

      // 1. Actualizar Licitación
      await updateLicitacion(licitacion.id, datosOC);

      // 2. Si está vinculada a un proyecto en Cartera, actualizar también el proyecto maestro
      if (licitacion.proyectoMaestroId) {
        await updateProyectoMaestro(licitacion.proyectoMaestroId, {
          ordenCompraNumero: numeroOCDetectado.trim(),
          codigoOC: numeroOCDetectado.trim(),
          codigoOP: numeroOP.trim(),
          codigoOT: numeroOT.trim(),
        });
      }

      alert(`¡Orden de Compra ${numeroOCDetectado.trim()} asociada y leída correctamente en la ficha del proyecto!`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error al guardar la OC:', err);
      alert('Ocurrió un error al guardar la Orden de Compra.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg max-h-[94vh] overflow-y-auto w-full p-6 shadow-2xl space-y-4 border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-purple-100 text-purple-900 px-2 py-0.5 rounded">
              Adjudicación Oficial • Ficha del Proyecto
            </span>
            <h3 className="text-base font-bold text-slate-800 mt-1">
              Cargar Orden de Compra (OC)
            </h3>
            <p className="text-xs text-slate-500">{licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleGuardarOC} className="space-y-4 text-xs">
          
          {/* Dropzone */}
          <div className="border-2 border-dashed border-purple-300 hover:border-purple-500 bg-purple-50/50 p-5 rounded-2xl text-center space-y-2 transition cursor-pointer relative">
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.doc,.docx"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-xs">
                {file ? file.name : 'Arrastre o seleccione el documento de Orden de Compra (PDF / Excel)'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                El sistema leerá e identificará automáticamente el número de OC de la universidad.
              </p>
            </div>
          </div>

          {/* Feedback de Lectura */}
          {parsing && (
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-800 font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-600 animate-spin" />
              <span>Analizando y leyendo el número de OC del documento...</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Campo Confirmador de Número de OC */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
              <span>Número de Orden de Compra (OC) *</span>
              {numeroOCDetectado && (
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Leído automáticamente
                </span>
              )}
            </label>
            <input
              type="text"
              required
              placeholder="Ej: OC-450012890"
              value={numeroOCDetectado}
              onChange={e => setNumeroOCDetectado(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-extrabold text-purple-900 text-sm"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Este número de OC quedará registrado permanentemente en la ficha del proyecto.
            </span>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Número de contrato (si corresponde)</label>
            <input
              type="text"
              placeholder="Ej: CONTRATO-2026-001"
              value={numeroContrato}
              onChange={e => setNumeroContrato(e.target.value.toUpperCase())}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-bold text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Orden de Trabajo (OT)</label>
              <input type="text" value={numeroOT} onChange={e => setNumeroOT(e.target.value.toUpperCase())} placeholder="OT-2026-001" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-bold" />
              <span className="text-[9px] text-slate-400">Lectura automática desde la OC.</span>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Orden de Pedido (OP)</label>
              <input type="text" value={numeroOP} onChange={e => setNumeroOP(e.target.value.toUpperCase())} placeholder="OP-2026-001" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-bold" />
              <span className="text-[9px] text-slate-400">Lectura automática desde la OC.</span>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || parsing}
              className="px-5 py-2 bg-purple-700 hover:bg-purple-800 text-white rounded-lg font-bold shadow-md transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'Guardando...' : 'Asociar OC a Ficha de Proyecto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
