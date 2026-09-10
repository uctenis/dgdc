import React, { useState } from 'react';
import { Upload, CheckCircle2, X, Sparkles, AlertCircle, Receipt, Copy, FileText, Check, ArrowRight } from 'lucide-react';
import type { LicitacionProyecto, EstadoPago } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { parseFactura } from '../utils/facturaParser';
import { uploadFileToProjectFolder } from '../services/driveService';
import { updateEstadoPago, updateLicitacion, syncGastoEfectivoToProyectoMaestro } from '../services/firestoreService';

interface CargaFacturaEstadoPagoModalProps {
  licitacion: LicitacionProyecto;
  estadoPago: EstadoPago;
  estadosPago: EstadoPago[];
  onClose: () => void;
  onSuccess?: () => void;
}

export const CargaFacturaEstadoPagoModal: React.FC<CargaFacturaEstadoPagoModalProps> = ({
  licitacion,
  estadoPago,
  estadosPago,
  onClose,
  onSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [numeroFactura, setNumeroFactura] = useState<string>(estadoPago.factura?.numeroFactura || '');
  const [montoFactura, setMontoFactura] = useState<number>(estadoPago.factura?.montoFactura || 0);
  const [copiedGlosa, setCopiedGlosa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [observacionDiferencia, setObservacionDiferencia] = useState(estadoPago.factura?.observacionDiferencia || '');

  // Glosa oficial generada por el sistema con Nombre del Proyecto y N° Estado de Pago
  const glosaOficialSistema = `Estado de Pago N° ${estadoPago.numero} - ${licitacion.nombreProyecto.toUpperCase()}`;

  const montoEsperadoEP = estadoPago.montoTotal;
  const coincidenciaMonto = montoFactura === montoEsperadoEP;

  const handleCopyGlosa = () => {
    navigator.clipboard.writeText(glosaOficialSistema);
    setCopiedGlosa(true);
    setTimeout(() => setCopiedGlosa(false), 2000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setParsing(true);
    setErrorMsg(null);

    try {
      const res = await parseFactura(selected);
      const avisos: string[] = [];

      if (res.numeroFactura) {
        setNumeroFactura(res.numeroFactura);
      } else {
        setNumeroFactura('');
        avisos.push('No se pudo leer el N° de Factura automáticamente. Ingréselo manualmente desde el documento.');
      }

      if (res.montoFactura && res.montoFactura > 0) {
        setMontoFactura(res.montoFactura);
      } else {
        setMontoFactura(0);
        avisos.push('No se pudo leer el monto de la Factura automáticamente. Ingréselo manualmente — nunca lo dé por corroborado sin revisar el documento.');
      }

      setErrorMsg(avisos.length ? avisos.join(' ') : null);
    } catch (err) {
      console.error('Error al analizar la factura:', err);
      setNumeroFactura('');
      setMontoFactura(0);
      setErrorMsg('No se pudo leer automáticamente la factura. Ingrese el N° y monto manualmente desde el documento.');
    } finally {
      setParsing(false);
    }
  };

  const handleGuardarFactura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!numeroFactura.trim()) {
      alert('Ingrese o confirme el número de la Factura.');
      return;
    }
    if (!montoFactura || montoFactura <= 0) {
      alert('Ingrese un monto válido para la factura.');
      return;
    }
    if (!coincidenciaMonto && !observacionDiferencia.trim()) {
      alert('El monto de la factura no coincide con el Estado de Pago aprobado. Ingrese una justificación de la diferencia antes de continuar.');
      return;
    }

    setSaving(true);
    try {
      let archivoResult: { id: string; url: string } | undefined;
      if (file) {
        archivoResult = await uploadFileToProjectFolder(file, licitacion.id, licitacion.nombreProyecto);
      }

      const datosFactura = {
        numeroFactura: numeroFactura.trim().toUpperCase(),
        montoFactura: montoFactura,
        glosaOficial: glosaOficialSistema,
        archivoNombre: file ? file.name : estadoPago.factura?.archivoNombre || 'Factura_EP.pdf',
        archivoURL: archivoResult?.url || estadoPago.factura?.archivoURL || '#',
        archivoDriveId: archivoResult?.id || estadoPago.factura?.archivoDriveId,
        fechaCarga: new Date().toLocaleDateString('es-CL'),
        verificada: coincidenciaMonto,
        ...(coincidenciaMonto ? {} : { observacionDiferencia: observacionDiferencia.trim() }),
      };

      // 1. Actualizar el Estado de Pago con la Factura verificada y estado Pagado
      await updateEstadoPago(licitacion.id, estadoPago.id, {
        factura: datosFactura,
        estado: 'Pagado',
      });

      // 2. Calcular nuevo Gasto Efectivo acumulado de todas las facturas verificadas
      const otrosEstadosFacturados = estadosPago.filter(
        ep => ep.id !== estadoPago.id && ep.factura && ep.factura.verificada
      );
      const gastoEfectivoTotal = otrosEstadosFacturados.reduce(
        (sum, ep) => sum + (ep.factura?.montoFactura || 0),
        0
      ) + montoFactura;

      // 3. Actualizar Gasto Efectivo en la Licitación en Firestore
      await updateLicitacion(licitacion.id, {
        gastoEfectivo: gastoEfectivoTotal,
      });

      // 4. Sincronizar automáticamente el Gasto Efectivo con el Proyecto Maestro en Firestore
      await syncGastoEfectivoToProyectoMaestro(licitacion.id, gastoEfectivoTotal);

      alert(
        `✓ ¡Factura N° ${numeroFactura.trim().toUpperCase()} asociada y corroborada exitosamente!\n\n` +
        `• Glosa: "${glosaOficialSistema}"\n` +
        `• Monto Facturado: ${formatoMonedaCLP(montoFactura)}\n` +
        `• Gasto Efectivo Total acumulado del proyecto actualizado a: ${formatoMonedaCLP(gastoEfectivoTotal)}.`
      );

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Error guardando factura:', err);
      alert('Error al guardar la factura. Intente nuevamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl max-h-[94vh] overflow-y-auto w-full p-6 shadow-2xl space-y-4 border border-slate-200 text-xs text-slate-800">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded flex items-center gap-1 w-fit">
              <Receipt className="w-3.5 h-3.5 text-emerald-700" />
              Facturación & Control de Gasto Efectivo SGC
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Cargar y Corroborar Factura — Estado de Pago N° {estadoPago.numero}
            </h3>
            <p className="text-xs text-slate-500 font-medium">{licitacion.nombreProyecto.toUpperCase()}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleGuardarFactura} className="space-y-4">
          
          {/* BANNER 1: GLOSA OFICIAL DEL SISTEMA */}
          <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 border border-slate-800">
            <div className="flex items-center justify-between text-[10px] font-extrabold uppercase text-slate-300">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-sky-400" />
                Glosa Oficial Generada por el Sistema
              </span>
              <button
                type="button"
                onClick={handleCopyGlosa}
                className="text-[10px] text-sky-300 font-bold hover:text-white flex items-center gap-1 bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded transition"
              >
                {copiedGlosa ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedGlosa ? 'Copiada' : 'Copiar Glosa'}</span>
              </button>
            </div>
            <p className="font-mono text-xs font-bold text-sky-200 bg-black/40 p-2.5 rounded-lg border border-slate-700 break-words select-all">
              "{glosaOficialSistema}"
            </p>
            <p className="text-[10px] text-slate-400 italic">
              Esta glosa vincula oficialmente el Estado de Pago N° {estadoPago.numero} con la factura emitida por la empresa contratista.
            </p>
          </div>

          {/* BANNER 2: DROPZONE DE CARGA DE ARCHIVO DE FACTURA */}
          <div className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50/40 p-4 rounded-xl text-center space-y-2 transition relative cursor-pointer">
            <input
              type="file"
              accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.xml"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            />
            <div className="w-9 h-9 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-xs">
                {file ? file.name : 'Seleccionar o arrastrar archivo de Factura (PDF, XML, Excel)'}
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                El sistema analizará el archivo y corroborará automáticamente el valor de la factura.
              </p>
            </div>
          </div>

          {/* Feedback de Análisis de Factura */}
          {parsing && (
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-800 font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-600 animate-spin" />
              <span>Analizando y leyendo el número y monto de la factura...</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Form Fields: N° Factura + Monto Factura */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Número de Factura *</label>
              <input
                type="text"
                required
                placeholder="Ej: FAC-10928"
                value={numeroFactura}
                onChange={e => setNumeroFactura(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none font-extrabold text-slate-900 text-xs"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">N° de documento fiscal</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Monto Total de la Factura (CLP) *</label>
              <input
                type="number"
                required
                value={montoFactura || ''}
                onChange={e => setMontoFactura(Number(e.target.value))}
                className={`w-full px-3 py-2 bg-white border rounded-lg focus:ring-2 outline-none font-extrabold text-xs ${
                  coincidenciaMonto
                    ? 'border-emerald-400 text-emerald-900 focus:ring-emerald-500'
                    : 'border-amber-400 text-amber-900 focus:ring-amber-500'
                }`}
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Valor a pago oficial
              </span>
            </div>
          </div>

          {/* VERIFICACIÓN Y CORROBORACIÓN DE VALORES */}
          <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
            coincidenciaMonto
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
              : 'bg-amber-50/90 border-amber-300 text-amber-950'
          }`}>
            {coincidenciaMonto ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 space-y-1">
              <strong className="block text-xs font-bold">
                {coincidenciaMonto
                  ? '✓ Valor de la Factura Corroborado Exitosamente'
                  : '⚠️ Diferencia en el Valor de la Factura contra el Estado de Pago'}
              </strong>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
                <span>Monto EP N° {estadoPago.numero}: <strong>{formatoMonedaCLP(montoEsperadoEP)}</strong></span>
                <ArrowRight className="w-3 h-3 text-slate-400" />
                <span>Monto Factura: <strong>{formatoMonedaCLP(montoFactura)}</strong></span>
              </div>
              <p className="text-[10px] opacity-80 mt-1">
                Al confirmar, el monto de <strong>{formatoMonedaCLP(montoFactura)}</strong> se agregará automáticamente al <strong>Gasto Efectivo</strong> del proyecto.
              </p>
              {!coincidenciaMonto && (
                <div className="mt-2">
                  <label className="block font-bold text-amber-900 mb-1">Justificación de la diferencia *</label>
                  <textarea
                    required
                    value={observacionDiferencia}
                    onChange={e => setObservacionDiferencia(e.target.value)}
                    placeholder="Explique por qué el monto de la factura difiere del Estado de Pago aprobado (ej: pago parcial, ajuste de redondeo, factura de aumento de obra)..."
                    rows={2}
                    className="w-full px-3 py-2 bg-white border border-amber-400 rounded-lg text-xs outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
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
              disabled={saving || parsing || !numeroFactura.trim()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'Procesando...' : 'Confirmar & Sumar a Gasto Efectivo'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
