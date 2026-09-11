/**
 * Normativa chilena sectorial específica por Rubro (ver rubrosData.ts), para
 * enriquecer las Bases Administrativas y Técnicas más allá de la plantilla
 * genérica por familia (basesTemplateData.ts). La familia (obra civil, obra
 * menor, diseño, suministro) define la estructura contractual; el rubro
 * define QUÉ normativa sectorial y QUÉ acreditaciones debe exigir esa
 * licitación en particular — no es lo mismo licitar una remodelación de
 * pintura que una de instalaciones eléctricas, aunque ambas sean "obra
 * menor". Las referencias deben revisarse periódicamente: la normativa
 * chilena (SEC, MINVU, MINSAL) se actualiza con cierta frecuencia.
 */

export interface ClausulaNormativaRubro {
  /** Texto que se agrega a la sección "Requisitos de los Oferentes" ya existente en la plantilla de familia. */
  requisitosOferentesAdicionales: string;
  /** Contenido de la sección nueva "Normativa Sectorial Aplicable" que se agrega al final del documento. */
  normativaAplicable: string;
}

export const NORMATIVA_POR_RUBRO: Record<string, ClausulaNormativaRubro> = {
  'Obras Civiles y Estructuras': {
    requisitosOferentesAdicionales:
      'Adicionalmente, por tratarse de obras civiles/estructurales: el profesional residente de obra debe ser Ingeniero Civil, Constructor Civil o Arquitecto con título vigente; si el proyecto requiere revisión estructural independiente (Ley N°20.703 y Art. 5.1.25 de la OGUC), el oferente debe declarar quién la efectuará.',
    normativaAplicable:
      'La ejecución de las obras deberá ajustarse a la Ley General de Urbanismo y Construcciones (DFL N°458) y su Ordenanza General (OGUC); al diseño sísmico según NCh433.Of1996 Mod. 2009 (Decreto Supremo N°61/2011 del MINVU); y al hormigón armado según NCh430.Of2008. Cuando corresponda revisión estructural independiente (Ley N°20.703), el contratista deberá facilitar el acceso a la obra y a los antecedentes de cálculo al revisor designado. Aplica además el D.S. N°594/2000 del MINSAL sobre condiciones sanitarias y ambientales básicas en los lugares de trabajo, y la Recepción Municipal de la Dirección de Obras Municipales (DOM) cuando el proyecto requiera permiso de edificación.',
  },
  'Instalaciones Eléctricas': {
    requisitosOferentesAdicionales:
      'Adicionalmente, por tratarse de instalaciones eléctricas: el oferente debe contar con instalador eléctrico autorizado e inscrito en la Superintendencia de Electricidad y Combustibles (SEC) en la clase habilitante para la potencia/tensión de esta instalación (Clase A a D según corresponda).',
    normativaAplicable:
      'Las instalaciones eléctricas deberán ejecutarse conforme a la Ley N°18.410 (que crea la Superintendencia de Electricidad y Combustibles, SEC) y a los Pliegos Técnicos del Reglamento de Instalaciones de Consumo Eléctrico (RIC N°01 a N°19 vigentes). Como condición previa a la Recepción Conforme, el contratista deberá entregar la Declaración de Instalación Eléctrica (TE1) presentada y aprobada ante la SEC, junto con el certificado de inscripción vigente del instalador responsable. Toda modificación de tableros, empalmes o circuitos debe quedar documentada en los planos "as built" entregados al cierre del contrato.',
  },
  'Instalaciones Sanitarias y Gas': {
    requisitosOferentesAdicionales:
      'Adicionalmente, por tratarse de instalaciones sanitarias y/o de gas: el proyecto sanitario debe estar suscrito por un profesional habilitado (Ingeniero Civil o Constructor Civil) conforme al RIDAA; si la partida incluye redes o artefactos de gas, el instalador debe contar con licencia SEC vigente en la clase correspondiente (Clase 1, 2 o 3 según el tipo de instalación).',
    normativaAplicable:
      'Las instalaciones domiciliarias de agua potable y alcantarillado deberán ajustarse al Reglamento de Instalaciones Domiciliarias de Agua Potable y de Alcantarillado (RIDAA, D.S. N°50/2002 del MOP) y quedar sujetas a la fiscalización de la Superintendencia de Servicios Sanitarios (SISS). Cuando el alcance incluya instalaciones interiores de gas, éstas deberán ejecutarse conforme al Reglamento de Instalaciones Interiores y Medidores de Gas (D.S. N°66/2007 de la SEC, con sus modificaciones vigentes) y contar con la certificación TC-6 ("sello verde") de la SEC como condición de la Recepción Conforme.',
  },
  'Climatización y Ventilación (HVAC)': {
    requisitosOferentesAdicionales:
      'Adicionalmente, por tratarse de climatización/ventilación: el oferente debe contar con personal técnico certificado para la manipulación de gases refrigerantes y, si el alcance incluye calderas o generadores de vapor, con operador acreditado conforme al D.S. N°10/2013 del MINSAL.',
    normativaAplicable:
      'Los sistemas de climatización y ventilación deberán cumplir el D.S. N°594/2000 del MINSAL (Art. 32 y siguientes, condiciones de ventilación en lugares de trabajo) y los caudales mínimos de renovación de aire de las Normas Chilenas NCh3308:2024 y NCh3309. Si el proyecto interviene la envolvente térmica del edificio, deberá además ajustarse a la Reglamentación Térmica de la OGUC vigente. El manejo, carga y disposición de gases refrigerantes deberá cumplir la normativa ambiental vigente (D.S. N°27 del Ministerio del Medio Ambiente, en línea con el Protocolo de Montreal). Los equipos ofertados deberán acreditar el cumplimiento de los estándares mínimos de eficiencia energética exigidos por la SEC cuando aplique.',
  },
  'Tabiquería, Cielos y Terminaciones': {
    requisitosOferentesAdicionales:
      'Adicionalmente, cuando la partida forme parte de vías de evacuación o de elementos de compartimentación exigidos por el proyecto: el oferente debe adjuntar certificados de reacción y resistencia al fuego de los materiales/sistemas propuestos.',
    normativaAplicable:
      'Los elementos de tabiquería, cielos y terminaciones deberán cumplir las condiciones de seguridad contra incendio de la OGUC (Art. 4.3) y la clasificación de reacción y resistencia al fuego según NCh935/1 y NCh2085, cuando la partida forme parte de vías de evacuación o de elementos de compartimentación exigidos por el proyecto. Cuando la partida integre la envolvente térmica del edificio, deberá además ajustarse a la Reglamentación Térmica de la OGUC (Art. 4.1.10) vigente.',
  },
  'Carpintería, Puertas y Ventanas': {
    requisitosOferentesAdicionales:
      'Adicionalmente: cuando el proyecto exija prestaciones térmicas certificadas de ventanería, el oferente debe adjuntar los certificados correspondientes; las puertas en rutas de evacuación o rutas accesibles deben cumplir los anchos y mecanismos exigidos por la normativa de accesibilidad universal vigente.',
    normativaAplicable:
      'La carpintería y ventanería deberá cumplir la Norma Chilena NCh2080 (prestaciones de ventanas) y, cuando corresponda, la Reglamentación Térmica de la OGUC vigente. Las puertas ubicadas en rutas de evacuación o rutas accesibles deberán cumplir los anchos libres, mecanismos de apertura y demás exigencias de la Ley N°20.422 y su reglamento de Accesibilidad Universal (D.S. N°50/2015 del MINVU, que modificó la OGUC).',
  },
  'Áridos, Materiales y Ferretería': {
    requisitosOferentesAdicionales:
      'Adicionalmente: cuando el suministro corresponda a áridos o materiales con incidencia estructural (hormigones, morteros estructurales), el oferente debe acreditar la calidad/origen del material mediante certificado o ensayo conforme a Norma Chilena.',
    normativaAplicable:
      'El suministro de áridos deberá cumplir la Norma Chilena NCh163 (áridos para morteros y hormigones) y contar con la certificación de calidad correspondiente cuando el destino sea estructural. Toda entrega deberá respaldarse con guía de despacho conforme a la normativa del Servicio de Impuestos Internos, indicando cantidad, tipo de material y obra de destino.',
  },
  'Arriendo de Maquinaria y Equipos': {
    requisitosOferentesAdicionales:
      'Adicionalmente: los operadores de la maquinaria deben contar con licencia municipal de conducir vigente en la clase profesional correspondiente (Clase D/E o A5/A4 según el equipo), y cada máquina debe contar con revisión técnica y SOAP vigentes.',
    normativaAplicable:
      'El arriendo y operación de maquinaria y equipos deberá cumplir el D.S. N°594/2000 del MINSAL en materia de seguridad operacional, y la Ley N°18.290 (Ley de Tránsito) respecto de la licencia de conducir profesional exigida a cada operador según el tipo de maquinaria. Cada equipo motorizado deberá contar con revisión técnica y Seguro Obligatorio de Accidentes Personales (SOAP) vigentes, y el proveedor deberá mantener póliza de responsabilidad civil por daños a terceros durante todo el período de arriendo.',
  },
  'Servicios Generales': {
    requisitosOferentesAdicionales:
      'Adicionalmente: si el servicio incluye vigilancia/seguridad, la empresa y su personal deben estar acreditados conforme a la Ley N°21.659 de Seguridad Privada; si incluye mantención de extintores, debe acreditar certificado de mantención vigente según NCh1433.',
    normativaAplicable:
      'Los servicios de vigilancia y seguridad privada deberán prestarse por una empresa y personal acreditados conforme a la Ley N°21.659 de Seguridad Privada (que reemplazó el régimen de autorización OS-10 de Carabineros). Los servicios de mantención de extintores y sistemas de extinción de incendios deberán cumplir la Norma Chilena NCh1433 y el D.S. N°594/2000 del MINSAL (Art. 44). Cuando el servicio se preste mediante personal permanente en dependencias de la Universidad, deberá cumplirse la Ley N°20.123 sobre subcontratación y la Ley N°16.744 sobre accidentes del trabajo.',
  },
  'Consultoría y Especialidades': {
    requisitosOferentesAdicionales:
      'Adicionalmente: los profesionales responsables deben estar inscritos vigentes en el colegio profesional que corresponda a su especialidad, cuando la ley lo exija (Colegio de Arquitectos, Colegio de Ingenieros, u otro), y acreditar experiencia verificable en proyectos de naturaleza y envergadura similares.',
    normativaAplicable:
      'El desarrollo de la consultoría deberá ajustarse a la normativa sectorial aplicable a la especialidad encargada: Ordenanza General de Urbanismo y Construcciones (OGUC) para proyectos de arquitectura; NCh433 y NCh430 para cálculo estructural; Pliegos Técnicos RIC de la SEC para proyectos eléctricos; RIDAA para proyectos sanitarios. El consultor deberá dejar constancia expresa en sus entregables del cumplimiento de la normativa vigente aplicable a cada especialidad desarrollada.',
  },
  'Equipamiento y Mobiliario': {
    requisitosOferentesAdicionales:
      'Adicionalmente: todo equipo con conexión eléctrica ofertado debe contar con el sello/certificado de aprobación vigente de la Superintendencia de Electricidad y Combustibles (SEC).',
    normativaAplicable:
      'Todo artefacto o equipo con conexión eléctrica deberá contar con el sello de aprobación de la Superintendencia de Electricidad y Combustibles (SEC) vigente al momento de la entrega, conforme a la normativa de certificación de productos eléctricos. El equipamiento deportivo, de laboratorio o mobiliario institucional deberá cumplir, cuando aplique, las Normas Chilenas de seguridad específicas a su categoría, y contar con garantía de fábrica y servicio técnico disponible en Chile.',
  },
  'Diseño, Señalética y Demarcaciones': {
    requisitosOferentesAdicionales:
      'Adicionalmente: toda señalética y demarcación proyectada debe cumplir las especificaciones de accesibilidad universal vigentes (Símbolo Internacional de Accesibilidad, NCh3180), y las demarcaciones viales dentro del campus deben ajustarse al Manual de Señalización de Tránsito vigente.',
    normativaAplicable:
      'El diseño de señalética institucional deberá cumplir la Ley N°20.422 y su reglamento de Accesibilidad Universal (D.S. N°50/2015 del MINVU), incluyendo el uso correcto del Símbolo Internacional de Accesibilidad conforme a NCh3180. Las demarcaciones de pavimentos y señalización de tránsito dentro de los campus deberán ajustarse al Manual de Señalización de Tránsito (Decreto N°78/2012 del MTT) en lo que resulte aplicable a vialidad interior.',
  },
};

/** Obtiene la cláusula normativa de un rubro (si existe una entrada exacta en el catálogo). */
export function obtenerClausulaNormativaPorRubro(rubro?: string): ClausulaNormativaRubro | null {
  if (!rubro) return null;
  return NORMATIVA_POR_RUBRO[rubro] || null;
}
