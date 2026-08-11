export interface CampusInfo {
  sigla: string;
  nombre: string;
  ciudad: string;
  edificios: string[];
}

export const CAMPUS_UCT: CampusInfo[] = [
  {
    "sigla": "CML",
    "nombre": "Campus Monseñor Alejandro Menchaca Lira",
    "ciudad": "Temuco",
    "edificios": [
      "CML01",
      "CML02",
      "CML03",
      "CML04",
      "CML05"
    ]
  },
  {
    "sigla": "CDS",
    "nombre": "Campus Dieciocho de Septiembre",
    "ciudad": "Temuco",
    "edificios": [
      "CDS01",
      "CDS101"
    ]
  },
  {
    "sigla": "CPH",
    "nombre": "Campus Phillippi",
    "ciudad": "Temuco",
    "edificios": [
      "CPH01",
      "CPH02",
      "CPH03",
      "CPH101"
    ]
  },
  {
    "sigla": "CSC",
    "nombre": "Campus Monseñor Sergio Contreras Navia",
    "ciudad": "Temuco",
    "edificios": [
      "CSC01",
      "CSC02",
      "CSC03"
    ]
  },
  {
    "sigla": "CTH",
    "nombre": "Campus Thiers",
    "ciudad": "Temuco",
    "edificios": [
      "CTH01"
    ]
  },
  {
    "sigla": "CBQ",
    "nombre": "Campus El Bosque",
    "ciudad": "Temuco",
    "edificios": [
      "CBQ01",
      "CBQ02",
      "CBQ03",
      "CBQ04",
      "CBQ05",
      "CBQ06"
    ]
  },
  {
    "sigla": "CSF",
    "nombre": "Campus San Francisco",
    "ciudad": "Temuco",
    "edificios": [
      "CSF01",
      "CSF02",
      "CSF03",
      "CSF04",
      "CSF05",
      "CSF06",
      "CSF07",
      "CSF08",
      "CSF09",
      "CSF10",
      "CSF11",
      "CSF12",
      "CSF13",
      "CSF14",
      "CSF15",
      "CSF16",
      "CSF17",
      "CSF18",
      "CSF21",
      "CSF101",
      "CSF102",
      "CSF103",
      "CSF104",
      "CSF105",
      "CSF107",
      "CSF108",
      "CSF110",
      "CSF120",
      "CSF130",
      "CSF140",
      "CSF150",
      "CSF160",
      "CSF162",
      "CSF260"
    ]
  },
  {
    "sigla": "CHS",
    "nombre": "Campus Prieto Norte",
    "ciudad": "Temuco",
    "edificios": [
      "CHS01",
      "CHS02"
    ]
  },
  {
    "sigla": "CEC",
    "nombre": "Campus Educación Continua",
    "ciudad": "Temuco",
    "edificios": [
      "CEC01",
      "CEC02",
      "CEC05",
      "CEC101",
      "CEC120",
      "CEC130",
      "CEC140",
      "CEC150"
    ]
  },
  {
    "sigla": "CJP",
    "nombre": "Campus San Juan Pablo II",
    "ciudad": "Temuco",
    "edificios": [
      "CJP01",
      "CJP02",
      "CJP03",
      "CJP04",
      "CJP05",
      "CJP06",
      "CJP07",
      "CJP08",
      "CJP09",
      "CJP10",
      "CJP11",
      "CJP12",
      "CJP13",
      "CJP14",
      "CJP15",
      "CJP16",
      "CJP17",
      "CJP101",
      "CJP102",
      "CJP103",
      "CJP104",
      "CJP105",
      "CJP106",
      "CJP107",
      "CJP108",
      "CJP110",
      "CJP115",
      "CJP120",
      "CJP130",
      "CJP135",
      "CJP140",
      "CJP145",
      "CJP150",
      "CJP152",
      "CJP153",
      "CJP155",
      "CJP156",
      "CJP158",
      "CJP160",
      "CJP162",
      "CJP164",
      "CJP165",
      "CJP166",
      "CJP168"
    ]
  },
  {
    "sigla": "CRC",
    "nombre": "Campus Doctor Luis Rivas Del Canto",
    "ciudad": "Temuco",
    "edificios": [
      "CRC01",
      "CRC02",
      "CRC03",
      "CRC04",
      "CRC05",
      "CRC06",
      "CRC07",
      "CRC08",
      "CRC09",
      "CRC10",
      "CRC13",
      "CRC14",
      "CRC16",
      "CRC17",
      "CRC18",
      "CRC101",
      "CRC111",
      "CRC112",
      "CRC113",
      "CRC114",
      "CRC115",
      "CRC120",
      "CRC125",
      "CRC126",
      "CRC130"
    ]
  },
  {
    "sigla": "CPL",
    "nombre": "Campus Pillanlelbun",
    "ciudad": "Pillanlelbun",
    "edificios": [
      "CPL01",
      "CPL02",
      "CPL03",
      "CPL05",
      "CPL06",
      "CPL04",
      "CPL07",
      "CPL08",
      "CPL09",
      "CPL10",
      "CPL101"
    ]
  },
  {
    "sigla": "CCC",
    "nombre": "Campus Curacautín",
    "ciudad": "Curacautín",
    "edificios": [
      "CCC"
    ]
  },
  {
    "sigla": "CSD",
    "nombre": "Campus Santiago Departamento",
    "ciudad": "Santiago",
    "edificios": [
      "CSD"
    ]
  },
  {
    "sigla": "CLE",
    "nombre": "CLE Nuestra Señora de Lourdes",
    "ciudad": "Temuco",
    "edificios": [
      "CLE"
    ]
  }
];

export const USOS_PROYECTO = [
  'DOCENCIA',
  'INVESTIGACIÓN',
  'ESPACIOS COMUNES',
  'ADMINISTRACIÓN',
  'OTROS',
];

export const ESTADOS_PROYECTO = [
  'PROYECTO',
  'COTIZACIÓN',
  'EN EJECUCIÓN',
  'TERMINADO',
  'POSTERGADO',
  'ELIMINADO',
  'AJUSTADO',
  'EN CARPETA',
];

export const TIPOS_OBRA = [
  'OBRA NUEVA',
  'AUMENTO DE OBRA',
  'AMPLIACIÓN',
  'REMODELACIÓN',
  'ÁREAS VERDES',
  'ALHAJAMIENTO',
  'REGULARIZACIÓN',
  'COMPRA ELEMENTOS',
  'DEMOLICIÓN',
  'INSTALACIONES',
  'OTROS',
];

export function obtenerCampusPorSigla(sigla: string): CampusInfo | undefined {
  return CAMPUS_UCT.find(c => c.sigla === sigla.toUpperCase());
}

export function obtenerEdificiosDeCampus(siglaCampus: string): string[] {
  if (!siglaCampus) return [];
  const c = CAMPUS_UCT.find(camp => camp.sigla === siglaCampus.toUpperCase());
  return c ? c.edificios : [];
}

export function buscarCampusYEdificioPorTexto(texto: string): { campus?: CampusInfo; edificio?: string } {
  if (!texto) return {};
  const upper = texto.toUpperCase();
  for (const campus of CAMPUS_UCT) {
    for (const ed of campus.edificios) {
      if (upper.includes(ed)) {
        return { campus, edificio: ed };
      }
    }
    if (upper.includes(campus.sigla) || upper.includes(campus.nombre.toUpperCase())) {
      return { campus };
    }
  }
  return {};
}
