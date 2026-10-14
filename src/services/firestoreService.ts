// Acceso a datos del sistema. El código vive en ./datos/, un archivo por tema; este índice mantiene un único
// punto de entrada para las pantallas, que no hablan con la base de datos directamente.

export { subscribeToProveedores, getProveedorPorId, getProveedorPorEmail, getProveedores, getHistorialObras, addHistorialObra, getEvaluacionesDesempeno, getEvaluacionesDesempenoDeProveedores, calcularPromedioDesempeno, calcularPromediosPorCriterio } from './datos/proveedores';
export { getAllProyectosMaestros, subscribeToProyectos, sincronizarFormatoPresupuesto, setAprobacionPresupuesto, setDecisionPresupuesto, traspasarProyectosDeCartera, reenviarProyectoAjustado, getEstadosPagoDeLicitaciones, syncOCToProyectoMaestro, syncGastoEfectivoToProyectoMaestro } from './datos/proyectos';
export { subscribeToLicitaciones, subscribeToLicitacion, getAllLicitaciones, asegurarLimiteOfertas } from './datos/licitaciones';
export { subscribeToInvitados, asegurarTokensInvitados, addEnvioInvitacion, subscribeToEnviosInvitaciones, getInvitadosLicitacion, getLicitacionesConInvitados, verificarInvitacionLicitacion, removeInvitado, registrarAccesoPortal } from './datos/invitados';
export { addConsulta, subscribeToConsultas, subscribeToMisConsultas, subscribeToConsultasPublicadas, subscribeToConsultasPendientes, updateInvitadoEstado } from './datos/consultas';
export { subscribeToCotizaciones, subscribeToAllCotizaciones, getAllCotizaciones, licitacionCerradaParaOfertas, plazoEntregaVencido, subscribeToEstadosPago, subscribeToAumentosObra, subscribeToBitacoraProyecto, addHitoDesarrolloProyecto, updateHitoDesarrolloEstado } from './datos/cotizacionesYObra';
export { subscribeToPropuestas, savePropuesta, cargarAntecedentesContrato, registrarConfirmacionPropuesta, getPropuesta, convertirPropuestaACotizacion } from './datos/propuestas';
export { createUserProfile, getUserProfile, updateUserProfile } from './datos/usuarios';
export { contarCarteraYLicitaciones, resetCarteraYLicitaciones } from './datos/mantenimiento';
export type { ProyectoConGastoEfectivo } from './datos/mantenimiento';
export { subscribeToGarantias, subscribeToGarantiasVigentes, registrarAperturaOfertas } from './datos/garantias';
export { subscribeToLibroObra, getFotosLibroObra, addEntradaLibroObra } from './datos/libroObra';
export { subscribeToMultas, marcarMultasDescontadas, migrarSiglaCampus, getPoliticaGarantiasProyecto } from './datos/multas';
export { subscribeToAclaraciones, marcarAclaracionesVistas } from './datos/aclaraciones';
export { addProveedor, updateProveedor, deleteProveedor, addEvaluacionDesempeno, updateEvaluacionDesempeno, deleteEvaluacionDesempeno, addProyectoMaestro, updateProyectoMaestro, deleteProyectoMaestro, addLicitacion, updateLicitacion, deleteLicitacion, addInvitado, responderConsulta, addCotizacion, deleteCotizacion, addEstadoPago, updateEstadoPago, addAumentoObra, updateAumentoObraEstado, adjudicarLicitacion, addGarantia, updateGarantia, deleteGarantia, addMulta, updateMulta, publicarAclaracion } from './datos/conRegistro';
export { crearInvitacionInscripcion, getInscripcion, guardarInscripcion, subscribeToInscripciones, observarInscripcion, rechazarInscripcion, marcarSolicitadaAdquisiciones, marcarRegistradaUCT, aprobarInscripcion } from './datos/inscripciones';
export { buscarLicitacionDeProyecto, buscarProyectoDeLicitacion, subscribeToDocumentoLicitacion, subscribeToDocumentoProyecto } from './datos/vinculos';
