import { FileSignature, Printer, X } from 'lucide-react';
import type { Cotizacion, EstadoPago, LicitacionProyecto } from '../types';
import { formatoMonedaCLP } from '../services/evaluationEngine';

interface Props {
  licitacion: LicitacionProyecto;
  oferta: Cotizacion;
  estadoPago: EstadoPago;
  estadosPago: EstadoPago[];
  onClose: () => void;
}

const fechaCL = (fecha?: string) => {
  if (!fecha) return 'No informada';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
  return new Intl.DateTimeFormat('es-CL').format(new Date(`${fecha}T12:00:00`));
};

const diferenciaDias = (inicio?: string, termino?: string) => {
  if (!inicio || !termino) return 0;
  return Math.floor((new Date(`${termino}T12:00:00`).getTime() - new Date(`${inicio}T12:00:00`).getTime()) / 86400000);
};

export function EstadoPagoDocumentModal({ licitacion, oferta, estadoPago, estadosPago, onClose }: Props) {
  const montoContrato = licitacion.montoAdjudicadoTotal || oferta.montoTotal;
  const montoAcumulado = estadosPago
    .filter(estado => estado.numero <= estadoPago.numero)
    .reduce((total, estado) => total + estado.montoTotal, 0);
  const saldoContrato = Math.max(0, montoContrato - montoAcumulado);
  const porcentajeFinanciero = montoContrato ? Math.min(100, Math.round(montoAcumulado / montoContrato * 10000) / 100) : 0;
  const responsable = licitacion.responsableNombre || 'RESPONSABLE DEL PROYECTO';
  const plazoDias = licitacion.plazoAdjudicadoDias || oferta.plazoDias;
  const diasConsumidos = licitacion.fechaInicioObra ? Math.max(0, diferenciaDias(licitacion.fechaInicioObra, estadoPago.fecha) + 1) : 0;
  const avanceProgramado = licitacion.fechaInicioObra && plazoDias
    ? Math.min(100, Math.round(diasConsumidos / plazoDias * 10000) / 100)
    : 0;
  const desviacionFisica = Math.round((estadoPago.porcentajeAvanceGlobal - avanceProgramado) * 100) / 100;
  const desviacionFinanciera = Math.round((porcentajeFinanciero - estadoPago.porcentajeAvanceGlobal) * 100) / 100;
  const diasRestantes = licitacion.fechaTerminoProgramada
    ? diferenciaDias(estadoPago.fecha, licitacion.fechaTerminoProgramada)
    : Math.max(0, plazoDias - diasConsumidos);
  const estadoPrograma = desviacionFisica < -5 ? 'ATRASADO' : desviacionFisica > 5 ? 'ADELANTADO' : 'EN LÍNEA';
  const colorEstado = estadoPrograma === 'ATRASADO' ? 'border-red-300 bg-red-50 text-red-800' : estadoPrograma === 'ADELANTADO' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-sky-300 bg-sky-50 text-sky-800';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 12mm; }
          body * { visibility: hidden !important; }
          .estado-pago-print, .estado-pago-print * { visibility: visible !important; }
          .estado-pago-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            overflow: visible !important;
            color: #0f172a !important;
          }
          .estado-pago-no-print { display: none !important; }
          .estado-pago-print table { page-break-inside: auto; }
          .estado-pago-print thead { display: table-header-group; }
          .estado-pago-print tr { page-break-inside: avoid; }
          .estado-pago-firma { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="estado-pago-no-print flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-black text-slate-900"><FileSignature className="h-5 w-5 text-sky-700" /> Documento del Estado de Pago N° {estadoPago.numero}</h2>
            <p className="text-xs text-slate-500">Vista oficial para revisión, firma y exportación a PDF.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button>
        </div>

        <article className="estado-pago-print flex-1 overflow-y-auto bg-white p-7 text-[11px] text-slate-800">
          <header className="border-2 border-slate-900">
            <div className="grid grid-cols-[1fr_2fr_1fr] divide-x-2 divide-slate-900 border-b-2 border-slate-900">
              <div className="flex items-center justify-center bg-slate-50 p-3 text-center text-[10px] font-black uppercase">Universidad Católica<br />de Temuco</div>
              <div className="p-3 text-center"><p className="text-[9px] font-bold uppercase text-slate-500">Subdirección de Infraestructura · Control de Obras</p><h1 className="mt-1 text-base font-black uppercase">Informe de Estado de Pago N° {estadoPago.numero}</h1><p className="mt-1 text-[9px] font-bold text-sky-800">CONTROL FÍSICO, FINANCIERO Y CONTRACTUAL</p></div>
              <div className="bg-slate-900 p-3 text-white"><p className="text-[8px] font-bold uppercase text-slate-300">Orden de compra principal</p><p className="mt-1 break-all font-mono text-xs font-black text-amber-300">{licitacion.ordenCompraNumero || 'NO INFORMADA'}</p><p className="mt-2 text-[8px] text-slate-300">Corte: {fechaCL(estadoPago.fecha)}</p></div>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[8px] font-bold uppercase text-slate-500">Proyecto / obra</p><h2 className="mt-1 text-sm font-black uppercase">{licitacion.nombreProyecto.toLocaleUpperCase('es-CL')}</h2><p className="mt-1 text-[9px] text-slate-500">Código de proyecto: <strong>{licitacion.codigoProyecto}</strong> · Campus {licitacion.campusSigla || 'No informado'} {licitacion.edificioSigla ? `· ${licitacion.edificioSigla}` : ''}</p></div><span className={`shrink-0 rounded-full border px-3 py-1 text-[9px] font-black ${colorEstado}`}>{estadoPrograma}</span></div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DatoContrato principal label="Orden de compra" value={licitacion.ordenCompraNumero || 'No informada'} />
                <DatoContrato label="Orden de pedido (OP)" value={licitacion.codigoOP || licitacion.ordenPedidoNumero || 'No informada'} />
                <DatoContrato label="Orden de trabajo (OT)" value={licitacion.codigoOT || licitacion.ordenTrabajoNumero || 'No informada'} />
                <DatoContrato label="Contrato" value={licitacion.numeroContrato || 'Sin contrato informado'} />
                <DatoContrato label="Centro de costo / CP" value={licitacion.codigoCP} />
                <DatoContrato label="Emisión / carga OC" value={fechaCL(licitacion.fechaCargaOC)} />
                <DatoContrato label="Inicio contractual" value={fechaCL(licitacion.fechaInicioObra)} />
                <DatoContrato label="Término contractual" value={fechaCL(licitacion.fechaTerminoProgramada)} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1.5 border-t border-slate-200 pt-3">
                <p><strong>Empresa contratista:</strong> {oferta.proveedorNombre}</p>
                <p><strong>RUT:</strong> {oferta.proveedorRut}</p>
                <p><strong>Responsable del proyecto:</strong> {responsable}</p>
                <p><strong>Plazo adjudicado:</strong> {plazoDias} días corridos</p>
              </div>
            </div>
          </header>

          <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Resumen label="Monto contrato" value={formatoMonedaCLP(montoContrato)} />
            <Resumen label="Estado actual" value={formatoMonedaCLP(estadoPago.montoTotal)} />
            <Resumen label="Acumulado" value={formatoMonedaCLP(montoAcumulado)} />
            <Resumen label="Saldo contractual" value={formatoMonedaCLP(saldoContrato)} />
          </section>

          <section className="mt-4 rounded-lg border border-slate-300 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4"><div><h3 className="font-black uppercase">Panel de avance y desviaciones</h3><p className="text-[9px] text-slate-500">Situación registrada a la fecha de corte del presente estado de pago.</p></div><div className={`rounded border px-3 py-1.5 text-center ${colorEstado}`}><span className="block text-[8px] font-bold uppercase">Estado del programa</span><strong>{estadoPrograma}</strong></div></div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <BarraAvance label="Avance programado" value={avanceProgramado} color="bg-slate-500" />
              <BarraAvance label="Avance físico real" value={estadoPago.porcentajeAvanceGlobal} color="bg-sky-600" />
              <BarraAvance label="Avance financiero" value={porcentajeFinanciero} color="bg-emerald-600" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-[9px]">
              <DatoDesviacion label="Desviación de plazo" value={`${desviacionFisica >= 0 ? '+' : ''}${desviacionFisica} pts`} alerta={desviacionFisica < -5} />
              <DatoDesviacion label="Financiero vs. físico" value={`${desviacionFinanciera >= 0 ? '+' : ''}${desviacionFinanciera} pts`} alerta={desviacionFinanciera > 5} />
              <DatoDesviacion label="Días consumidos" value={`${diasConsumidos} de ${plazoDias}`} />
              <DatoDesviacion label="Días restantes al corte" value={`${diasRestantes} días`} alerta={diasRestantes < 0} />
            </div>
            {(desviacionFisica < -5 || desviacionFinanciera > 5 || diasRestantes < 0) && <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[9px] font-bold text-red-800">Alerta de gestión: el proyecto presenta una desviación que requiere análisis, justificación y medidas correctivas.</p>}
          </section>

          <section className="mt-5">
            <div className="mb-3 rounded border border-slate-200 px-3 py-2"><span className="text-[8px] font-black uppercase text-slate-500">Alcance general del proyecto</span><p className="mt-1 leading-relaxed">{licitacion.descripcion || 'Sin descripción contractual registrada.'}</p></div>
            <div className="mb-2 flex items-end justify-between"><h3 className="font-black uppercase">Detalle de avance valorizado</h3><span className="text-[9px] text-slate-500">Estado documental: <strong>{estadoPago.estado}</strong> · Avance físico: <strong>{estadoPago.porcentajeAvanceGlobal}%</strong></span></div>
            <table className="w-full border-collapse border border-slate-900 text-[9px]">
              <thead className="bg-slate-900 text-white"><tr><th className="border-r border-slate-700 p-2 text-left">Ítem / descripción</th><th className="border-r border-slate-700 p-2 text-right">Valor partida</th><th className="border-r border-slate-700 p-2 text-right">Anterior</th><th className="border-r border-slate-700 p-2 text-right">Período</th><th className="border-r border-slate-700 p-2 text-right">Acumulado</th><th className="p-2 text-right">Monto período</th></tr></thead>
              <tbody>
                {estadoPago.items.map(item => (
                  <tr key={item.itemCotizacionId} className="border-t border-slate-300">
                    <td className="border-r border-slate-300 p-2"><strong>{item.item}</strong><span className="block text-slate-500">{item.descripcion}</span></td>
                    <td className="border-r border-slate-300 p-2 text-right">{formatoMonedaCLP(item.precioTotal)}</td>
                    <td className="border-r border-slate-300 p-2 text-right">{item.avanceAnteriorPct}%</td>
                    <td className="border-r border-slate-300 p-2 text-right font-bold text-sky-800">{item.avancePeriodoPct}%</td>
                    <td className="border-r border-slate-300 p-2 text-right font-bold">{item.avanceAcumuladoPct}%</td>
                    <td className="p-2 text-right font-bold text-emerald-800">{formatoMonedaCLP(item.montoPeriodo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-900 bg-slate-50 font-bold"><tr><td colSpan={5} className="p-2 text-right">NETO DEL PERÍODO</td><td className="p-2 text-right">{formatoMonedaCLP(estadoPago.montoNeto)}</td></tr><tr><td colSpan={5} className="p-2 text-right">IVA</td><td className="p-2 text-right">{formatoMonedaCLP(estadoPago.montoIva)}</td></tr><tr className="bg-slate-900 text-white"><td colSpan={5} className="p-2 text-right">TOTAL ESTADO DE PAGO</td><td className="p-2 text-right">{formatoMonedaCLP(estadoPago.montoTotal)}</td></tr></tfoot>
            </table>
          </section>

          <section className="mt-4 rounded-lg border border-slate-300 p-3">
            <h3 className="text-[9px] font-black uppercase text-slate-500">Observaciones y respaldo</h3>
            <p className="mt-1 min-h-8 whitespace-pre-wrap">{estadoPago.observaciones || 'Sin observaciones.'}</p>
            {estadoPago.archivoNombre && <p className="mt-2 text-[9px]"><strong>Documento de respaldo:</strong> {estadoPago.archivoNombre}</p>}
          </section>

          <section className="estado-pago-firma mt-6 border border-slate-900">
            <div className="border-b border-slate-900 bg-slate-100 px-3 py-2 text-center font-black uppercase">Certificación del responsable del proyecto</div>
            <p className="px-5 pt-4 text-center leading-relaxed">Se certifica que el avance indicado fue revisado respecto de las partidas contratadas y corresponde al período informado en este estado de pago.</p>
            {estadoPago.firmaResponsable ? (
              <div className="mx-auto my-4 max-w-xl border-2 border-emerald-700 bg-emerald-50 px-5 py-4 text-center text-emerald-950">
                <div className="flex items-center justify-center gap-2 text-sm font-black uppercase"><FileSignature className="h-5 w-5" /> Firmado electrónicamente</div>
                <strong className="mt-2 block text-xs uppercase">{estadoPago.firmaResponsable.nombre}</strong>
                <span className="block text-[9px]">{estadoPago.firmaResponsable.cargo}</span>
                <span className="block text-[9px]">{estadoPago.firmaResponsable.email} · {new Date(estadoPago.firmaResponsable.fecha).toLocaleString('es-CL')}</span>
                <span className="mt-2 block break-all font-mono text-[7px] text-slate-600">SHA-256: {estadoPago.firmaResponsable.sha256}</span>
              </div>
            ) : (
              <div className="mx-auto flex min-h-[120px] max-w-md flex-col items-center justify-end px-8 pb-4">
                <div className="w-full border-b-2 border-slate-900"></div>
                <strong className="mt-2 text-xs uppercase">{responsable}</strong>
                <span className="text-[9px] text-slate-600">Responsable del Proyecto / Inspección Técnica de Obra</span>
                <span className="mt-1 text-[9px] font-bold text-amber-700">PENDIENTE DE FIRMA ELECTRÓNICA</span>
              </div>
            )}
          </section>

          <footer className="mt-4 flex justify-between border-t border-slate-400 pt-2 text-[8px] text-slate-500"><span>Control de avance físico y financiero · Subdirección de Infraestructura</span><span>ESTADO DE PAGO N° {estadoPago.numero}</span></footer>
        </article>

        <div className="estado-pago-no-print flex items-center justify-end gap-3 border-t bg-slate-50 px-5 py-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">Cerrar</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-slate-800"><Printer className="h-4 w-4" /> Imprimir / Exportar PDF</button>
        </div>
      </div>
    </div>
  );
}

function Resumen({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-300 bg-slate-50 p-3"><span className="block text-[8px] font-bold uppercase text-slate-500">{label}</span><strong className="mt-1 block text-[11px] text-slate-900">{value}</strong></div>;
}

function DatoContrato({ label, value, principal = false }: { label: string; value: string; principal?: boolean }) {
  return <div className={`rounded border p-2 ${principal ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50'}`}><span className={`block text-[7px] font-bold uppercase ${principal ? 'text-slate-300' : 'text-slate-500'}`}>{label}</span><strong className={`mt-0.5 block break-words text-[9px] ${principal ? 'text-amber-300' : 'text-slate-900'}`}>{value}</strong></div>;
}

function BarraAvance({ label, value, color }: { label: string; value: number; color: string }) {
  const porcentaje = Math.min(100, Math.max(0, value));
  return <div><div className="mb-1 flex justify-between text-[8px] font-bold"><span>{label}</span><span>{porcentaje}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white ring-1 ring-slate-200"><div className={`h-full rounded-full ${color}`} style={{ width: `${porcentaje}%` }}></div></div></div>;
}

function DatoDesviacion({ label, value, alerta = false }: { label: string; value: string; alerta?: boolean }) {
  return <div className={`rounded border px-2 py-1.5 ${alerta ? 'border-red-300 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-700'}`}><span className="block text-[7px] font-bold uppercase opacity-70">{label}</span><strong className="mt-0.5 block">{value}</strong></div>;
}
