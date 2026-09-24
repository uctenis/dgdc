import { Building2, Lock } from 'lucide-react';

/**
 * Pantalla neutra del portal cuando se llega sin un enlace de invitación (o sin sesión).
 * A propósito no ofrece formulario de ingreso, registro ni lista de empresas: al Portal de
 * Proveedores solo se entra desde el enlace del correo de invitación a una licitación.
 */
export function PortalAccesoRestringido() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0369a1 100%)' }}
    >
      <div className="mb-8 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)' }}
        >
          <Building2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Portal de Proveedores</h1>
        <p className="text-sky-300 text-sm mt-1">Universidad Católica de Temuco · DGDC</p>
      </div>

      <div
        className="w-full max-w-md rounded-3xl p-8 space-y-4 text-center"
        style={{
          background: 'rgba(255,255,255,0.07)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 24px 48px -8px rgba(0,0,0,0.5)',
        }}
      >
        <Lock className="w-8 h-8 text-sky-300 mx-auto" />
        <h2 className="text-lg font-bold text-white">Acceso solo por invitación</h2>
        <p className="text-sm text-slate-300 leading-relaxed">
          Para ingresar al portal use el enlace que recibió en el correo de invitación a la licitación.
          Si no lo encuentra, revise su carpeta de spam o solicite el reenvío a la Subdirección de Infraestructura.
        </p>
      </div>
    </div>
  );
}
