export interface ResponsableInfraestructura {
  codigo: string;
  nombre: string;
  email: string;
  cargo?: string;
}

export const RESPONSABLES_INFRAESTRUCTURA: ResponsableInfraestructura[] = [
  { codigo: 'D.Silva', nombre: 'David Silva Roco', email: 'dsilva@uct.cl', cargo: 'Sub-Director de Infraestructura' },
  { codigo: 'M.Zurita', nombre: 'M. Zurita', email: 'mzurita@uct.cl', cargo: 'Ingeniero de Proyectos' },
  { codigo: 'F.Anselme', nombre: 'Felipe Anselme', email: 'fanselme@uct.cl', cargo: 'Ingeniero de Desarrollo' },
  { codigo: 'C.Correa', nombre: 'Cristóbal Correa', email: 'ccorrea@uct.cl', cargo: 'Ingeniero de Proyectos' },
  { codigo: 'M.Matus', nombre: 'M. Matus', email: 'mmatus@uct.cl', cargo: 'Ingeniero de Infraestructura' },
  { codigo: 'J.Solis de Ovando', nombre: 'J. Solís de Ovando', email: 'jsolis@uct.cl', cargo: 'Coordinador de Obras' },
  { codigo: 'L. Rios', nombre: 'L. Ríos', email: 'lrios@uct.cl', cargo: 'Ingeniero de Proyectos' },
  { codigo: 'C. Huenchual', nombre: 'C. Huenchual', email: 'chuenchual@uct.cl', cargo: 'Supervisor de Obras' },
  { codigo: 'O. Painen', nombre: 'O. Painén', email: 'opainen@uct.cl', cargo: 'Supervisor de Terreno' },
  { codigo: 'I. Cisternas', nombre: 'Iván Cisternas Cisternas', email: 'icisternas@uct.cl', cargo: 'Director de Gestión y Desarrollo de Campus' },
  { codigo: 'A. Meza', nombre: 'Arturo Meza', email: 'ameza@uct.cl', cargo: 'Ingeniero de Proyectos' },
  { codigo: 'I. Riquelme', nombre: 'I. Riquelme', email: 'iriquelme@uct.cl', cargo: 'Inspector Técnico de Obra (ITO)' },
];

export function obtenerResponsablePorCodigo(codigo: string): ResponsableInfraestructura | undefined {
  if (!codigo) return undefined;
  const clean = codigo.trim().toLowerCase();
  return RESPONSABLES_INFRAESTRUCTURA.find(r => r.codigo.toLowerCase() === clean || r.nombre.toLowerCase().includes(clean));
}
