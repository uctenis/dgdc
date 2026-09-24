import { useMemo, useState } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  ClipboardList, Download, ExternalLink, Loader2, CheckCircle2, Clock, FileText, Upload, AlertTriangle, ChevronDown, ChevronRight, Hourglass,
} from 'lucide-react';
import type { LicitacionProyecto, Cotizacion, Proveedor, ConfiguracionFirmas } from '../types';
import { ActaEvaluacionModal } from './ActaEvaluacionModal';
import { updateLicitacion, updateProyectoMaestro } from '../services/firestoreService';
import { uploadLicitacionDocument } from '../services/storageService';
import { formatoMonedaCLP } from '../services/evaluationEngine';
import { useAuth } from '../context/AuthContext';

// ─── BANDEJA DE SOLICITUDES DE OP ───────────────────────────────────────────
// Flujo institucional: acta de adjudicación firmada → Secretaría la ingresa en Kellun (sistema
// externo, calificacion.uct.cl) → Kellun entrega la Orden de Pedido (OP) → Secretaría registra
// aquí el N° de OP → Finanzas/Adquisiciones emite la OC. Este sistema NO se conecta con Kellun:
// solo junta los documentos para subirlos allá y guarda el número que Kellun entrega.

const URL_KELLUN = 'https://calificacion.uct.cl/login2023/';

interface Props {
  licitaciones: LicitacionProyecto[];
  cotizaciones: Cotizacion[];
  proveedores: Proveedor[];
  configFirmas: ConfiguracionFirmas;
}

interface DocumentoPaquete {
  nombre: string;
  url: string;
}

const tieneOP = (l: LicitacionProyecto) => Boolean((l.codigoOP || l.ordenPedidoNumero || '').trim());
const tieneOC = (l: LicitacionProyecto) => Boolean((l.ordenCompraNumero || l.archivoOCURL || '').trim());
const actaFirmada = (l: LicitacionProyecto) => l.actaFirmaDigital?.estado === 'Firmada';

const fechaFirmaActa = (l: LicitacionProyecto): string | undefined => {
  const fechas = (l.actaFirmaDigital?.firmas || []).map(f => f.fecha).filter(Boolean).sort();
  return fechas[fechas.length - 1] || l.actaFirmaDigital?.fechaActualizacion;
};

const formatearFecha = (iso?: string) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
};

const diasDesde = (iso?: string) => {
  if (!iso) return undefined;
  const d = new Date(iso).getTime();
  return Number.isNaN(d) ? undefined : Math.floor((Date.now() - d) / 86400000);
};

const nombreSeguro = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 90);

const extensionDe = (nombre: string, url: string) => {
  const m = nombre.match(/\.[a-z0-9]{2,5}$/i) || decodeURIComponent(url.split('?')[0]).match(/\.[a-z0-9]{2,5}$/i);
  return m ? m[0].toLowerCase() : '.pdf';
};

/** Documentos que Secretaría sube a Kellun: acta firmada, oferta adjudicada y antecedentes. */
function documentosParaKellun(l: LicitacionProyecto, oferta?: Cotizacion): DocumentoPaquete[] {
  const docs: DocumentoPaquete[] = [];
  const valida = (u?: string) => Boolean(u && u !== '#' && /^https?:/i.test(u));
  if (valida(l.actaFirmaDigital?.archivoURL)) {
    docs.push({ nombre: `01 Acta de adjudicación firmada${extensionDe(l.actaFirmaDigital?.archivoNombre || '', l.actaFirmaDigital!.archivoURL!)}`, url: l.actaFirmaDigital!.archivoURL! });
  }
  if (oferta && valida(oferta.documentoCotizacionURL)) {
    docs.push({ nombre: `02 Oferta económica ${nombreSeguro(oferta.proveedorNombre)}${extensionDe('', oferta.documentoCotizacionURL!)}`, url: oferta.documentoCotizacionURL! });
  }
  if (oferta && valida(oferta.ofertaTecnicaURL)) {
    docs.push({ nombre: `03 Oferta técnica ${nombreSeguro(oferta.proveedorNombre)}${extensionDe('', oferta.ofertaTecnicaURL!)}`, url: oferta.ofertaTecnicaURL! });
  }
  (l.antecedentesTecnicos || []).forEach((a, i) => {
    if (valida(a.archivoURL)) {
      docs.push({ nombre: `${String(10 + i).padStart(2, '0')} ${nombreSeguro(a.nombre || a.tipo)}${extensionDe(a.archivoNombre || '', a.archivoURL!)}`, url: a.archivoURL! });
    }
  });
  return docs;
}

export function BandejaOPPage({ licitaciones, cotizaciones, proveedores, configFirmas }: Props) {
  const { isAdmin } = useAuth();
  const [actaAbierta, setActaAbierta] = useState<LicitacionProyecto | null>(null);
  const [verEnFirma, setVerEnFirma] = useState(false);
  const [verConOC, setVerConOC] = useState(false);

  const ofertaDe = (l: LicitacionProyecto) =>
    cotizaciones.find(c => c.id === l.cotizacionAdjudicadaId)
    || cotizaciones.find(c => c.licitacionId === l.id && c.proveedorId === (l.proveedorAdjudicadoId || l.proveedorGanadorId));

  const grupos = useMemo(() => {
    const adjudicadas = licitaciones.filter(l => l.estado === 'Adjudicado' || actaFirmada(l) || tieneOP(l));
    const porFechaActa = (a: LicitacionProyecto, b: LicitacionProyecto) => (fechaFirmaActa(a) || '').localeCompare(fechaFirmaActa(b) || '');
    return {
      pendientes: adjudicadas.filter(l => actaFirmada(l) && !tieneOP(l)).sort(porFechaActa),
      enFirma: adjudicadas.filter(l => !actaFirmada(l) && !tieneOP(l) && l.estado === 'Adjudicado'),
      esperandoOC: adjudicadas.filter(l => tieneOP(l) && !tieneOC(l)).sort((a, b) => (a.opRegistro?.fecha || '').localeCompare(b.opRegistro?.fecha || '')),
      conOC: adjudicadas.filter(l => tieneOP(l) && tieneOC(l)).sort((a, b) => (b.fechaCargaOC || '').localeCompare(a.fechaCargaOC || '')).slice(0, 15),
    };
  }, [licitaciones]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" /> Solicitudes de Orden de Pedido (OP)
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Actas de adjudicación firmadas que deben ingresarse en <strong>Kellun</strong>. Descargue el paquete de documentos,
            súbalo en Kellun y registre aquí el N° de OP que le entregue. Cuando llegue la Orden de Compra, la licitación avanza sola.
          </p>
        </div>
        <a
          href={URL_KELLUN}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-sm"
        >
          <ExternalLink className="w-4 h-4" /> Abrir Kellun
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Resumen etiqueta="Pendientes de OP" valor={grupos.pendientes.length} color="amber" />
        <Resumen etiqueta="Con OP · esperando OC" valor={grupos.esperandoOC.length} color="indigo" />
        <Resumen etiqueta="Acta aún en firma" valor={grupos.enFirma.length} color="slate" />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" /> Pendientes de ingresar en Kellun ({grupos.pendientes.length})
        </h2>
        {grupos.pendientes.length === 0 ? (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-4">No hay actas firmadas pendientes de OP. 🎉</p>
        ) : (
          grupos.pendientes.map(l => <TarjetaPendiente key={l.id} licitacion={l} oferta={ofertaDe(l)} onVerActa={() => setActaAbierta(l)} />)
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-extrabold text-slate-800 flex items-center gap-2">
          <Hourglass className="w-4 h-4 text-indigo-600" /> OP registrada · esperando Orden de Compra ({grupos.esperandoOC.length})
        </h2>
        {grupos.esperandoOC.length === 0 ? (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-xl p-4">Ninguna OP esperando Orden de Compra.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {grupos.esperandoOC.map(l => (
              <FilaSeguimiento key={l.id} licitacion={l} oferta={ofertaDe(l)} detalle={
                <>OP <strong className="font-mono">{l.codigoOP || l.ordenPedidoNumero}</strong> · registrada {formatearFecha(l.opRegistro?.fecha)}
                  {diasDesde(l.opRegistro?.fecha) !== undefined && <span className={diasDesde(l.opRegistro?.fecha)! > 10 ? 'text-rose-600 font-bold' : ''}> · hace {diasDesde(l.opRegistro?.fecha)} día(s)</span>}
                  {l.opRegistro?.archivoURL && <> · <a href={l.opRegistro.archivoURL} target="_blank" rel="noreferrer" className="text-indigo-600 underline">ver OP</a></>}
                </>
              } />
            ))}
          </div>
        )}
      </section>

      <Plegable titulo={`Adjudicadas con acta aún en firma (${grupos.enFirma.length})`} abierto={verEnFirma} onToggle={() => setVerEnFirma(v => !v)}>
        <p className="text-[11px] text-slate-500 mb-2">Aparecerán en "Pendientes" apenas se complete la firma del acta.</p>
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {grupos.enFirma.length === 0
            ? <p className="text-xs text-slate-500 p-4">Ninguna.</p>
            : grupos.enFirma.map(l => (
              <FilaSeguimiento key={l.id} licitacion={l} oferta={ofertaDe(l)} detalle={
                <>Acta: {l.actaFirmaDigital ? `${l.actaFirmaDigital.estado} (${l.actaFirmaDigital.firmas?.length || 0} firma(s))` : 'sin iniciar la firma'}</>
              } />
            ))}
        </div>
      </Plegable>

      <Plegable titulo={`Con Orden de Compra (últimas ${grupos.conOC.length})`} abierto={verConOC} onToggle={() => setVerConOC(v => !v)}>
        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {grupos.conOC.length === 0
            ? <p className="text-xs text-slate-500 p-4">Ninguna todavía.</p>
            : grupos.conOC.map(l => (
              <FilaSeguimiento key={l.id} licitacion={l} oferta={ofertaDe(l)} detalle={
                <>OP <strong className="font-mono">{l.codigoOP || l.ordenPedidoNumero}</strong> → OC <strong className="font-mono">{l.ordenCompraNumero || '—'}</strong> · {formatearFecha(l.fechaCargaOC)}</>
              } />
            ))}
        </div>
      </Plegable>

      {actaAbierta && (
        <ActaEvaluacionModal
          licitacion={actaAbierta}
          cotizaciones={cotizaciones}
          proveedores={proveedores}
          configFirmas={configFirmas}
          soloLectura
          onClose={() => setActaAbierta(null)}
          onAdjudicar={async () => { /* solo lectura: la bandeja no adjudica */ }}
        />
      )}

      {isAdmin && (
        <p className="text-[10px] text-slate-400">
          Vista de administrador. La Secretaría (mbustos@uct.cl) ve solo esta bandeja.
        </p>
      )}
    </div>
  );
}

function Resumen({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: 'amber' | 'indigo' | 'slate' }) {
  const estilos = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    slate: 'bg-white border-slate-200 text-slate-700',
  }[color];
  return (
    <div className={`rounded-2xl border p-4 ${estilos}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">{etiqueta}</p>
      <p className="text-2xl font-black mt-1">{valor}</p>
    </div>
  );
}

function Plegable({ titulo, abierto, onToggle, children }: { titulo: string; abierto: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section>
      <button type="button" onClick={onToggle} className="text-sm font-extrabold text-slate-700 flex items-center gap-1.5 mb-2 hover:text-slate-900">
        {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} {titulo}
      </button>
      {abierto && children}
    </section>
  );
}

function Encabezado({ licitacion: l, oferta }: { licitacion: LicitacionProyecto; oferta?: Cotizacion }) {
  const monto = l.montoAdjudicadoTotal || oferta?.montoTotal;
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-mono font-bold text-slate-500">{l.codigoProyecto || l.id}{l.codigoCP ? ` · CP ${l.codigoCP}` : ''}</p>
      <p className="text-sm font-extrabold text-slate-900 truncate">{l.nombreProyecto}</p>
      <p className="text-[11px] text-slate-600">
        {l.proveedorAdjudicadoNombre || oferta?.proveedorNombre || 'Proveedor sin informar'}
        {monto ? <> · <strong>{formatoMonedaCLP(monto)}</strong></> : null}
        {l.responsableNombre ? <> · Resp.: {l.responsableNombre}</> : null}
      </p>
    </div>
  );
}

function FilaSeguimiento({ licitacion, oferta, detalle }: { licitacion: LicitacionProyecto; oferta?: Cotizacion; detalle: React.ReactNode }) {
  return (
    <div className="p-3.5 flex flex-wrap items-center justify-between gap-2">
      <Encabezado licitacion={licitacion} oferta={oferta} />
      <p className="text-[11px] text-slate-600">{detalle}</p>
    </div>
  );
}

function TarjetaPendiente({ licitacion: l, oferta, onVerActa }: { licitacion: LicitacionProyecto; oferta?: Cotizacion; onVerActa: () => void }) {
  const { user } = useAuth();
  const docs = useMemo(() => documentosParaKellun(l, oferta), [l, oferta]);
  const [descargando, setDescargando] = useState(false);
  const [avisoDescarga, setAvisoDescarga] = useState<string | null>(null);
  const [numeroOP, setNumeroOP] = useState('');
  const [archivoOP, setArchivoOP] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dias = diasDesde(fechaFirmaActa(l));

  const descargarPaquete = async () => {
    setDescargando(true);
    setAvisoDescarga(null);
    const zip = new JSZip();
    const fallidos: DocumentoPaquete[] = [];
    await Promise.all(docs.map(async d => {
      try {
        const resp = await fetch(d.url);
        if (!resp.ok) throw new Error(String(resp.status));
        zip.file(d.nombre, await resp.blob());
      } catch {
        fallidos.push(d);
      }
    }));
    const incluidos = docs.length - fallidos.length;
    if (incluidos > 0) {
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${nombreSeguro(`${l.codigoProyecto || l.id} ${l.nombreProyecto}`)} - para Kellun.zip`);
    }
    if (fallidos.length) {
      setAvisoDescarga(
        `${incluidos ? `El .zip incluye ${incluidos} documento(s). ` : ''}${fallidos.length} documento(s) no se pudieron agregar al .zip (están en Drive o en otro servidor): descárguelos uno por uno con los enlaces de abajo.`
      );
    }
    setDescargando(false);
  };

  const registrarOP = async () => {
    const op = numeroOP.trim().toUpperCase();
    if (!op) { setError('Ingrese el N° de OP que entregó Kellun.'); return; }
    setError(null);
    setGuardando(true);
    try {
      let archivo: { archivoNombre?: string; archivoURL?: string } = {};
      if (archivoOP) {
        const renombrado = new File([archivoOP], `OP_${op}_${archivoOP.name}`, { type: archivoOP.type });
        const url = await uploadLicitacionDocument(l.id, 'ordenes-compra', renombrado);
        archivo = { archivoNombre: renombrado.name, archivoURL: url };
      }
      await updateLicitacion(l.id, {
        codigoOP: op,
        ordenPedidoNumero: op,
        estadoLifecycle: 'OP_Emitida',
        opRegistro: { fecha: new Date().toISOString(), registradoPor: user?.email || undefined, ...archivo },
      });
      // La OP también se ve en la Cartera (Ficha del Proyecto).
      if (l.proyectoMaestroId) {
        await updateProyectoMaestro(l.proyectoMaestroId, { codigoOP: op }).catch(err =>
          console.warn('No se pudo reflejar la OP en la Cartera:', err));
      }
    } catch (err) {
      console.error('Error registrando OP:', err);
      setError('No se pudo registrar la OP. Revise su conexión e intente nuevamente.');
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Encabezado licitacion={l} oferta={oferta} />
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border flex items-center gap-1 ${dias !== undefined && dias > 5 ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
          <Clock className="w-3 h-3" /> Acta firmada {formatearFecha(fechaFirmaActa(l))}{dias !== undefined ? ` · hace ${dias} día(s)` : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Paso 1: documentos para Kellun */}
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2">
          <p className="text-[11px] font-extrabold text-slate-800">1. Documentos para subir en Kellun</p>
          <button
            type="button"
            onClick={onVerActa}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold"
          >
            <FileText className="w-3.5 h-3.5" /> Ver acta firmada / Exportar PDF
          </button>
          {docs.length === 0 ? (
            <p className="text-[11px] text-slate-500">No hay otros documentos adjuntos en esta licitación.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {docs.map(d => (
                  <li key={d.url}>
                    <a href={d.url} target="_blank" rel="noreferrer" className="text-[11px] text-indigo-700 hover:underline flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 shrink-0" /> {d.nombre}
                    </a>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={descargarPaquete}
                disabled={descargando}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 rounded-lg text-[11px] font-bold disabled:opacity-50"
              >
                {descargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                Descargar todo (.zip)
              </button>
              {avisoDescarga && <p className="text-[10px] text-amber-800">{avisoDescarga}</p>}
            </>
          )}
          <a href={URL_KELLUN} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 hover:text-slate-900">
            <ExternalLink className="w-3.5 h-3.5" /> Ir a Kellun
          </a>
        </div>

        {/* Paso 2: registrar la OP */}
        <div className="rounded-xl bg-indigo-50/50 border border-indigo-200 p-3 space-y-2">
          <p className="text-[11px] font-extrabold text-indigo-900">2. Registrar la OP que entregó Kellun</p>
          <input
            value={numeroOP}
            onChange={e => setNumeroOP(e.target.value.toUpperCase())}
            placeholder="N° de Orden de Pedido"
            className="w-full px-3 py-2 border border-indigo-300 rounded-lg text-sm font-bold font-mono bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-indigo-600" />
            <span className="truncate">{archivoOP ? archivoOP.name : 'Adjuntar PDF de la OP (opcional)'}</span>
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setArchivoOP(e.target.files?.[0] || null)} />
          </label>
          {error && <p className="text-[11px] text-rose-700">{error}</p>}
          <button
            type="button"
            onClick={registrarOP}
            disabled={guardando}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
          >
            {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Registrar OP
          </button>
        </div>
      </div>
    </div>
  );
}
