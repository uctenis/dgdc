// ─── GENERACIÓN DE BASES ADMINISTRATIVAS Y TÉCNICAS DESDE LOS DATOS DEL PROYECTO ───
//
// Punto único donde se arma el texto de las Bases a partir de un ProyectoMaestro,
// usado tanto por BasesLicitacionModal (edición manual) como por
// firestoreService.updateProyectoMaestro (resincronización automática cuando
// cambian datos del proyecto que las Bases ya generadas citan textualmente).

import type { ProyectoMaestro } from '../types';
import {
  getPlantillaBasesPorTipoObra,
  aplicarDatosAPlantilla,
  aplicarNormativaPorRubro,
  resolverContenidoGarantias,
  resolverContenidoModalidad,
  sugerirPoliticaGarantias,
  type SeccionBases,
  type ModalidadContrato,
} from '../data/basesTemplateData';
import { obtenerClausulaNormativaPorRubro } from '../data/normativaPorRubro';
import { obtenerCampusPorSigla } from '../data/campusData';
import { formatoMonedaCLP } from '../services/evaluationEngine';

/** Campos del proyecto que, al cambiar, dejan desactualizado el texto ya generado de las Bases. */
export const CAMPOS_QUE_AFECTAN_BASES: (keyof ProyectoMaestro)[] = [
  'nombre',
  'descripcion',
  'valorAprox',
  'campusSigla',
  'edificioSigla',
  'tipoObra',
  'rubro',
  'plazoEjecucionDias',
  'duracionEstimadaDias',
  'politicaGarantias',
  'modalidadContrato',
];

/** Datos reales del proyecto que reemplazan los {{marcadores}} en el texto de las Bases. */
export function construirDatosMergeBases(proyecto: ProyectoMaestro): Record<string, string> {
  // El plazo REAL del contrato adjudicado (plazoEjecucionDias) manda una vez que existe;
  // mientras el proyecto no se licita, se usa la duración aproximada declarada al crearlo.
  const plazoDiasEfectivo = proyecto.plazoEjecucionDias || proyecto.duracionEstimadaDias;
  return {
    nombreProyecto: proyecto.nombre || '',
    campus: proyecto.campusNombre || proyecto.campusSigla || '—',
    edificio: proyecto.edificioSigla ? ` · Edificio ${proyecto.edificioSigla}` : '',
    direccionCampus: (() => {
      const dir = obtenerCampusPorSigla(proyecto.campusSigla || '')?.direccion;
      return dir ? `, ${dir}` : '';
    })(),
    montoEstimado: formatoMonedaCLP(proyecto.valorAprox || 0),
    plazoDias: plazoDiasEfectivo ? `${plazoDiasEfectivo}` : '[definir]',
    tipoObra: proyecto.tipoObra || '[definir]',
    descripcionProyecto: proyecto.descripcion?.trim() || 'Complete aquí el detalle específico del alcance de este proyecto.',
  };
}

/** Construye las secciones de Bases desde cero, con los datos ACTUALES del proyecto. */
export function construirSeccionesBasesDesdeCero(
  proyecto: ProyectoMaestro,
  modalidad: ModalidadContrato = proyecto.modalidadContrato || 'Suma Alzada'
): SeccionBases[] {
  const datosMerge = construirDatosMergeBases(proyecto);
  const politicaGarantias = proyecto.politicaGarantias || sugerirPoliticaGarantias(proyecto.valorAprox || 0);
  const clausulaRubro = obtenerClausulaNormativaPorRubro(proyecto.rubro);

  return aplicarNormativaPorRubro(
    getPlantillaBasesPorTipoObra(proyecto.tipoObra).map(s => {
      if (s.id === 'garantias') return { ...s, contenido: aplicarDatosAPlantilla(resolverContenidoGarantias(politicaGarantias, s.contenido), datosMerge) };
      if (s.id === 'modalidad') return { ...s, contenido: resolverContenidoModalidad(modalidad) };
      return { ...s, contenido: aplicarDatosAPlantilla(s.contenido, datosMerge) };
    }),
    clausulaRubro,
    proyecto.rubro
  );
}
