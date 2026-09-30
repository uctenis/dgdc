import { useState } from 'react';
import type { LicitacionProyecto, Proveedor } from '../types';
import { LicitacionDetalle } from './LicitacionDetalle';
import { Pantalla } from './PortalInvitacionPage';
import { construirInvitacionCorreo } from '../utils/invitacionCorreo';

const enDias = (dias: number) => {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
};

const licitacionDemo = {
  id: 'demo',
  codigoCP: '409-1722',
  codigoOP: '',
  codigoOT: '',
  codigoProyecto: '2026_005',
  nombreProyecto: 'CAMBIO DE CUBIERTA EDIFICIO CJP08',
  descripcion: 'Cambio de cubierta lado sur del edificio: retiro de cubierta existente, reposición de estructura de techumbre, aislación térmica y nueva cubierta de zinc-alum.',
  montoEstimado: 4641000,
  estado: 'En Evaluacion',
  fechaVisitaTerreno: enDias(3),
  fechaRecepcionConsultas: enDias(6),
  fechaRespuestaConsultas: enDias(8),
  fechaEvaluacion: enDias(14),
  antecedentesTecnicos: [
    { id: 'a1', nombre: 'Bases Administrativas', tipo: 'Bases Administrativas', archivoNombre: 'bases_administrativas.pdf', archivoURL: 'https://example.com/bases.pdf', fechaCarga: enDias(0), cargadoPor: 'Infraestructura' },
    { id: 'a2', nombre: 'Especificaciones Técnicas', tipo: 'Bases Tecnicas', archivoNombre: 'eett.pdf', archivoURL: 'https://example.com/eett.pdf', fechaCarga: enDias(0), cargadoPor: 'Infraestructura' },
    { id: 'a3', nombre: 'Planos de cubierta y techumbre', tipo: 'Planos', archivoNombre: 'planos.pdf', archivoURL: 'https://example.com/planos.pdf', fechaCarga: enDias(0), cargadoPor: 'Infraestructura' },
    { id: 'a4', nombre: 'Presupuesto referencial (interno, no debe verse)', tipo: 'Presupuesto', archivoNombre: 'ppto.xlsx', archivoURL: 'https://example.com/ppto.xlsx', fechaCarga: enDias(0), cargadoPor: 'Infraestructura' },
  ],
  formatoPresupuesto: [
    { item: '1.1', fase: 'Obras Preliminares', descripcion: 'Instalación de faenas y cierres perimetrales', unidad: 'gl', cantidad: 1 },
    { item: '1.2', fase: 'Obras Preliminares', descripcion: 'Retiro de cubierta existente', unidad: 'm2', cantidad: 180 },
    { item: '2.1', fase: 'Obra Gruesa', descripcion: 'Reposición de estructura de techumbre', unidad: 'm2', cantidad: 180 },
    { item: '2.2', fase: 'Obra Gruesa', descripcion: 'Aislación térmica', unidad: 'm2', cantidad: 180 },
    { item: '3.1', fase: 'Terminaciones', descripcion: 'Cubierta zinc-alum e=0,5 mm', unidad: 'm2', cantidad: 190 },
    { item: '3.2', fase: 'Terminaciones', descripcion: 'Hojalatería, canales y bajadas', unidad: 'ml', cantidad: 48 },
  ],
} as unknown as LicitacionProyecto;

const proveedorDemo = {
  id: 'demo',
  rut: '76.123.456-7',
  razonSocial: 'Constructora Los Robles SpA',
  nombreContacto: 'María Soto',
  email: 'contacto@losrobles.cl',
  telefono: '+56 9 8765 4321',
  rubro: 'Obras Civiles',
  cuentaSustentabilidad: false,
  direccion: 'Av. Alemania 0123',
  ciudad: 'Temuco',
  estado: 'Activo',
  fechaRegistro: '2026-01-01',
} as Proveedor;

const PASOS = ['1. Correo de invitación', '2. Ingreso al portal', '3. Portal: consultas y oferta'] as const;

/** Paso 1: el correo tal como lo recibe el proveedor (misma plantilla que el envío real). */
function CorreoInvitacion({ onIngresar }: { onIngresar: () => void }) {
  const portalUrl = `${window.location.origin}/portal/licitacion/demo?t=codigo-personal`;
  const { asunto, html } = construirInvitacionCorreo(licitacionDemo, portalUrl, proveedorDemo.razonSocial);
  return (
    <div className="min-h-screen bg-slate-100 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 space-y-1 text-sm text-slate-600">
          <p className="text-lg font-bold text-slate-900">{asunto}</p>
          <p><strong>De:</strong> Subdirección de Infraestructura UCT</p>
          <p><strong>Para:</strong> {proveedorDemo.email}</p>
        </div>
        {/* Cualquier enlace del correo lleva al paso siguiente en vez de salir de la demostración. */}
        <div
          className="px-6 py-6"
          onClick={e => { if ((e.target as HTMLElement).closest('a')) { e.preventDefault(); onIngresar(); } }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
      <p className="text-center text-xs text-slate-500 mt-4">Haga clic en «Ingresar al Portal de Proveedores», como lo haría el proveedor.</p>
    </div>
  );
}

/** Paso 2: la pantalla de ingreso del enlace personal (en la real se valida la cuenta contra la invitación). */
function IngresoPortal({ onIngresar }: { onIngresar: () => void }) {
  return (
    <Pantalla>
      <div className="text-center space-y-1">
        <h2 className="text-lg font-bold text-white">Invitación a licitación</h2>
        <p className="text-xs text-sky-200 leading-relaxed">
          Ingrese con el correo al que llegó la invitación para revisar los antecedentes y presentar su propuesta.
        </p>
      </div>
      <button
        type="button"
        onClick={onIngresar}
        className="w-full py-3 rounded-xl font-bold text-sm text-slate-900 bg-white flex items-center justify-center gap-3 hover:bg-sky-50 shadow-lg"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white font-black text-blue-600 ring-1 ring-slate-200">G</span>
        Ingresar con Google
      </button>
      <p className="text-center text-xs text-slate-400">¿No usa Google? Puede pedir un enlace de ingreso por correo.</p>
      <p className="text-[11px] text-amber-200/80 text-center">
        Demostración: se entra como {proveedorDemo.email}. En la versión real, si la cuenta no es la invitada, no ve nada de la licitación.
      </p>
    </Pantalla>
  );
}

/** SOLO servidor local (/portal/demo): recorrido completo del proveedor invitado con datos de ejemplo. */
export function PortalDemo() {
  const [paso, setPaso] = useState(0);
  const [reinicio, setReinicio] = useState(0);
  const reiniciar = () => { setReinicio(r => r + 1); setPaso(0); };
  return (
    <div>
      <div className="px-4 py-2 flex flex-wrap items-center justify-center gap-2 text-xs font-bold" style={{ background: '#78350f', color: '#fde68a' }}>
        <span title="Para una prueba que llegue a la licitación: en la licitación, pestaña Invitados → «Ver portal de proveedores» → «Probar como este proveedor».">
          Demostración visual · no llega a ninguna licitación (para la prueba real: Invitados → Ver portal → Probar como este proveedor)
        </span>
        <span className="opacity-50">|</span>
        {PASOS.map((nombre, i) => (
          <button
            key={nombre}
            type="button"
            onClick={() => setPaso(i)}
            className={`px-2.5 py-1 rounded-lg ${paso === i ? 'bg-amber-300 text-amber-950' : 'hover:bg-amber-900'}`}
          >
            {nombre}
          </button>
        ))}
        <button type="button" onClick={reiniciar} className="px-2.5 py-1 rounded-lg border border-amber-300/50 hover:bg-amber-900">↺ Reiniciar</button>
      </div>
      {paso === 0 && <CorreoInvitacion onIngresar={() => setPaso(1)} />}
      {paso === 1 && <IngresoPortal onIngresar={() => setPaso(2)} />}
      {/* Se mantiene montado para no perder lo avanzado al cambiar de paso. */}
      <div style={{ display: paso === 2 ? undefined : 'none' }}>
        <LicitacionDetalle key={reinicio} demoLicitacion={licitacionDemo} demoProveedor={proveedorDemo} proveedorIdVista="demo" />
      </div>
    </div>
  );
}
