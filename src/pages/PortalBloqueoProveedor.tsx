import { LogOut, ShieldX } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Una cuenta de proveedor solo sirve para su ventana privada de invitación. Si llega a cualquier otra parte del
 * sitio (el sistema institucional, su login, etc.) se le muestra esto y nada más.
 */
export function PortalBloqueoProveedor() {
  const { logout } = useAuth();
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0369a1 100%)' }}
    >
      <div
        className="w-full max-w-md rounded-3xl p-8 space-y-4 text-center"
        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <ShieldX className="w-8 h-8 text-red-300 mx-auto" />
        <h1 className="text-lg font-bold text-white">Acceso no permitido</h1>
        <p className="text-sm text-slate-300 leading-relaxed">
          Su cuenta de proveedor solo permite acceder a la invitación que recibió por correo.
          Este sitio es de uso interno de la Universidad Católica de Temuco.
        </p>
        <button
          onClick={() => { void logout(); }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white"
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
        >
          <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
