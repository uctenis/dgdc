import type { ProyectoMaestro, ItemItemizadoProyecto } from '../types';
import { generarEETTWord } from '../services/eettDocxGenerator';
import { INITIAL_CONFIG_FIRMAS } from '../data/initialData';

// SOLO servidor local (ruta /demo/eett): genera un Word de EETT con datos de ejemplo para revisar
// el formato de exportación sin sesión de Firebase.

const partidas: ItemItemizadoProyecto[] = [
  { id: 'p1', item: '1', fase: 'Instalación de Faenas', descripcion: 'Instalación de faenas y cierre provisorio', unidad: 'gl', cantidad: 1, precioUnitario: 0, precioTotal: 0, origen: 'IA' },
  { id: 'p2', item: '2.1', fase: 'Terminaciones', descripcion: 'Suministro de manta térmica de burbuja 500 micrones', unidad: 'm2', cantidad: 312, precioUnitario: 0, precioTotal: 0, origen: 'IA' },
  { id: 'p3', item: '2.2', fase: 'Terminaciones', descripcion: 'Enrollador de acero inoxidable con ruedas', unidad: 'un', cantidad: 2, precioUnitario: 0, precioTotal: 0, origen: 'IA' },
  { id: 'p4', item: '3', fase: 'Aseo y Entrega', descripcion: 'Aseo final y retiro de escombros', unidad: 'gl', cantidad: 1, precioUnitario: 0, precioTotal: 0, origen: 'IA' },
];

const especificaciones: Record<string, string> = {
  p1: 'Esta partida comprende la provisión, montaje y desmontaje de las instalaciones provisorias necesarias para el resguardo de materiales, herramientas y personal durante la ejecución del proyecto, además de un cierre perimetral de seguridad para delimitar el área de trabajo. Se utilizarán paneles de madera tipo OSB o equivalente técnico para el cierre, junto con señalética de seguridad según normativa vigente.\nLa medición y forma de pago será global (gl), por la totalidad de la instalación de faenas recibida a conformidad por la ITO.',
  p2: 'Considera el suministro, dimensionamiento e instalación de una manta térmica de burbujas de 500 micrones de espesor mínimo, para la retención de calor y reducción de evaporación en la piscina. El material será polietileno de alta densidad con tratamiento UV y resistencia al cloro, tipo GeoBubble o equivalente técnico.\nMEDICIÓN Y PAGO: por metro cuadrado (m2) de manta efectivamente instalada y aprobada por la ITO.',
  p3: 'Comprende la provisión e instalación de dos enrolladores móviles para el manejo y resguardo de la manta térmica, con eje telescópico de aluminio anodizado y soportes de acero inoxidable AISI 304 o equivalente técnico, con ruedas de alta resistencia y freno.\nMEDICIÓN Y PAGO: por unidad (un) instalada y probada.',
  p4: '',
};

const proyecto = {
  id: 'demo', correlativo: 7, codigoProyecto: '2026_007', codigoCP: '409-1722', codigoOP: '', codigoOT: '',
  nombre: 'MANTA TERMICA PISCINA CURACAUTIN', descripcion: 'La Subdirección de Infraestructura requiere la adquisición e instalación de una manta térmica para la piscina del Campus Curacautín, zona precordillerana de clima frío, para reducir la pérdida de calor y la evaporación del agua cuando el recinto no está en uso.', valorAprox: 9000000, estado: 'Pendiente', fechaCreacion: '',
  campusSigla: 'CCC', edificioSigla: '', tipoObra: 'REMODELACION', rubro: 'Obras Exteriores, Pavimentos y Paisajismo',
  modalidadContrato: 'Suma Alzada', responsableNombre: 'J. Solís de Ovando', responsableEmail: 'jsolis@uct.cl',
} as unknown as ProyectoMaestro;

const generalidades = 'ALCANCE: Las presentes especificaciones regulan la provisión e instalación de un sistema de manta térmica para la piscina del Campus Curacautín.\nNORMATIVA: Las obras se regirán por la OGUC, las Normas Chilenas aplicables, la Ley N°16.744 y el D.S. N°594.\nMATERIALES: Todos los materiales serán nuevos y de primera calidad; toda marca se entiende "o equivalente técnico".';

export function EETTDemo() {
  return (
    <main className="p-10">
      <button
        id="exportar"
        onClick={() => generarEETTWord({ proyecto, partidas, especificaciones, generalidades, estado: 'Borrador', version: 2, configFirmas: INITIAL_CONFIG_FIRMAS })}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold"
      >
        Exportar EETT de ejemplo
      </button>
    </main>
  );
}
