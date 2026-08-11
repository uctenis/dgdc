export interface ResponsableInfraestructura {
  codigo: string;
  nombre: string;
  email: string;
  cargo?: string;
  telefono?: string;
  estado?: 'Activo' | 'Inactivo';
}

export const INITIAL_RESPONSABLES: ResponsableInfraestructura[] = [
  { codigo: 'dsilva', nombre: 'David Silva Roco', email: 'dsilva@uct.cl', cargo: 'Sub-Director de Infraestructura', estado: 'Activo' },
  { codigo: 'mzurita', nombre: 'M. Zurita', email: 'mzurita@uct.cl', cargo: 'Ingeniero de Proyectos', estado: 'Activo' },
  { codigo: 'fanselme', nombre: 'Felipe Anselme', email: 'fanselme@uct.cl', cargo: 'Ingeniero de Desarrollo', estado: 'Activo' },
  { codigo: 'ccorrea', nombre: 'Cristóbal Correa', email: 'ccorrea@uct.cl', cargo: 'Ingeniero de Proyectos', estado: 'Activo' },
  { codigo: 'mmatus', nombre: 'M. Matus', email: 'mmatus@uct.cl', cargo: 'Ingeniero de Infraestructura', estado: 'Activo' },
  { codigo: 'jsolis', nombre: 'J. Solís de Ovando', email: 'jsolis@uct.cl', cargo: 'Coordinador de Obras', estado: 'Activo' },
  { codigo: 'lrios', nombre: 'L. Ríos', email: 'lrios@uct.cl', cargo: 'Ingeniero de Proyectos', estado: 'Activo' },
  { codigo: 'chuenchual', nombre: 'C. Huenchual', email: 'chuenchual@uct.cl', cargo: 'Supervisor de Obras', estado: 'Activo' },
  { codigo: 'opainen', nombre: 'O. Painén', email: 'opainen@uct.cl', cargo: 'Supervisor de Terreno', estado: 'Activo' },
  { codigo: 'icisternas', nombre: 'Iván Cisternas Cisternas', email: 'icisternas@uct.cl', cargo: 'Director de Gestión y Desarrollo de Campus', estado: 'Activo' },
  { codigo: 'ameza', nombre: 'Arturo Meza', email: 'ameza@uct.cl', cargo: 'Ingeniero de Proyectos', estado: 'Activo' },
  { codigo: 'iriquelme', nombre: 'I. Riquelme', email: 'iriquelme@uct.cl', cargo: 'Inspector Técnico de Obra (ITO)', estado: 'Activo' },
];

const STORAGE_KEY = 'infra_app_responsables_v2';

export function getResponsablesList(): ResponsableInfraestructura[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_RESPONSABLES));
      return INITIAL_RESPONSABLES;
    }
    const list: ResponsableInfraestructura[] = JSON.parse(raw);
    // Asegurar que el código sea el usuario antes de la @ en el correo
    return list.map(r => {
      if (r.email && r.email.includes('@')) {
        const emailCode = r.email.split('@')[0].trim().toLowerCase();
        if (emailCode) {
          return { ...r, codigo: emailCode };
        }
      }
      return r;
    });
  } catch {
    return INITIAL_RESPONSABLES;
  }
}

export function saveResponsablesList(list: ResponsableInfraestructura[]): void {
  try {
    const normalized = list.map(r => {
      if (r.email && r.email.includes('@')) {
        const emailCode = r.email.split('@')[0].trim().toLowerCase();
        if (emailCode) {
          return { ...r, codigo: emailCode };
        }
      }
      return r;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (e) {
    console.error('Error al guardar responsables:', e);
  }
}

export let RESPONSABLES_INFRAESTRUCTURA: ResponsableInfraestructura[] = getResponsablesList();

export function reloadResponsables(): ResponsableInfraestructura[] {
  RESPONSABLES_INFRAESTRUCTURA = getResponsablesList();
  return RESPONSABLES_INFRAESTRUCTURA;
}

export function obtenerResponsablePorCodigo(codigo: string): ResponsableInfraestructura | undefined {
  if (!codigo) return undefined;
  const clean = codigo.trim().toLowerCase();
  const list = getResponsablesList();
  return list.find(r => 
    r.codigo.toLowerCase() === clean || 
    (r.email && r.email.split('@')[0].toLowerCase() === clean) ||
    r.nombre.toLowerCase().includes(clean)
  );
}
