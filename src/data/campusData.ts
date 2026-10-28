import { guardarConfigCompartida } from '../services/configCompartida';
import { comoTitulo } from '../utils/texto';
export interface CampusInfo {
  sigla: string;
  nombre: string;
  ciudad: string;
  direccion?: string;
  /** Enlace a la carpeta del campus en Google Drive. */
  driveUrl?: string;
  edificios: string[];
  /** Datos de cada edificio, por sigla (ej. "CML01"). Opcional: un edificio puede no tener ficha aún. */
  edificiosInfo?: Record<string, EdificioInfo>;
}

/** Ficha de un edificio (editable en Configuración → Sedes & Campus). */
export interface EdificioInfo {
  /** Nombre con que se conoce el edificio (ej. "Edificio Central", "Biblioteca"). */
  nombre?: string;
  /** Facultad, escuela o unidad que lo ocupa principalmente. */
  facultad?: string;
  superficieM2?: number;
  /** Uso principal (docencia, laboratorios, administración, deportivo…). */
  uso?: string;
  /** Enlace a la carpeta del edificio en Google Drive. */
  driveUrl?: string;
  notas?: string;
  /** Punto del edificio o zona marcado en Google Maps (grados decimales). */
  lat?: number;
  lng?: number;
}

// ─── ZONAS EXTERIORES ───────────────────────────────────────────────────────
// Todo campus tiene, además de sus edificios, estos códigos para las obras que no ocurren dentro de
// ninguno (pavimentar un acceso, un jardín, un cierro). No se guardan en el catálogo: existen para
// todos los campus, y en `edificiosInfo` solo queda lo que se les edite (ubicación, superficie, notas).
const ZONAS_EXTERIORES = [
  { sufijo: 'CE', nombre: 'Circulaciones exteriores', uso: 'Accesos, pavimentos, veredas, estacionamientos y patios' },
  { sufijo: 'AV', nombre: 'Áreas verdes', uso: 'Jardines, arbolado, riego y paisajismo' },
  { sufijo: 'EX', nombre: 'Otras obras exteriores', uso: 'Cierros, portones, alumbrado y redes exteriores' },
] as const;

/** Códigos de las zonas exteriores de un campus: "CSF-CE", "CSF-AV", "CSF-EX". */
export function zonasExterioresDeCampus(siglaCampus: string): string[] {
  const sigla = siglaCampus.trim().toUpperCase();
  return sigla ? ZONAS_EXTERIORES.map(z => `${sigla}-${z.sufijo}`) : [];
}

/** Zona exterior a la que corresponde un código, o undefined si es un edificio. */
export function zonaExteriorDeCodigo(codigo?: string) {
  const sufijo = /-([A-Z]{2})$/.exec((codigo || '').trim().toUpperCase())?.[1];
  return ZONAS_EXTERIORES.find(z => z.sufijo === sufijo);
}

// ─── UBICACIÓN EN EL MAPA ───────────────────────────────────────────────────
/** Plaza Aníbal Pinto: referencia para medir cuán lejos de Temuco queda una obra (fletes y traslados). */
const CENTRO_TEMUCO = { lat: -38.7397, lng: -72.5901 };

/**
 * Lee un punto desde lo que entrega Google Maps: las coordenadas copiadas con clic derecho
 * ("-38.7359, -72.6021") o un enlace largo (…/@-38.73,-72.60,17z, …!3d-38.73!4d-72.60, ?q=-38.73,-72.60).
 * Los enlaces cortos (maps.app.goo.gl) no traen el punto y devuelven null.
 */
export function leerCoordenadas(texto: string): { lat: number; lng: number } | null {
  const t = texto.trim();
  if (!t) return null;
  const candidatos = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,          // punto marcado en un enlace largo
    /[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i,
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,              // centro de la vista
    /^\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/, // "lat, lng"
  ];
  for (const patron of candidatos) {
    const m = patron.exec(t);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)) {
      return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    }
  }
  return null;
}

/** Enlace para abrir un punto en Google Maps. */
export const urlGoogleMaps = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** Distancia en línea recta al centro de Temuco, en km. */
function distanciaATemucoKm(lat: number, lng: number): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat - CENTRO_TEMUCO.lat);
  const dLng = rad(lng - CENTRO_TEMUCO.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(CENTRO_TEMUCO.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 10) / 10;
}

const STORAGE_KEY = 'infra_app_campus_v1';

const INITIAL_CAMPUS_UCT: CampusInfo[] = [
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
    "sigla": "CSL",
    "nombre": "Campus Nuestra Señora de Lourdes",
    "ciudad": "Temuco",
    "edificios": [
      "CSL01",
      "CSL02"
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
    "sigla": "CSN",
    "nombre": "Campus San Nicolás (Curacautín)",
    "ciudad": "Curacautín",
    "edificios": [
      "CSN",
      "CSN11",
      "CSN12",
      "CSN13",
      "CSN14",
      "CSN15",
      "CSN16",
      "CSN17",
      "CSN21",
      "CSN31",
      "CSN_101",
      "CSN_105",
      "CSN_110",
      "CSN_111",
      "CSN_115",
      "CSN_116",
      "CSN_117",
      "CSN_118",
      "CSN_120",
      "CSN_121",
      "CSN_122",
      "CSN_123",
      "CSN_124",
      "CSN_125",
      "CSN_130",
      "CSN_170",
      "CSN_180",
      "CSN_190",
      "CSN_195"
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
    "nombre": "Parque Industrial Lautaro",
    "ciudad": "Lautaro",
    "edificios": [
      "CLE"
    ]
  }
];

// Catálogo editable desde Configuración → Sedes y Campus. Persiste en localStorage,
// mismo patrón que rubrosData.ts/centrosCostoData.ts/tiposObraData.ts.
export function getCampusList(): CampusInfo[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_CAMPUS_UCT));
      return INITIAL_CAMPUS_UCT;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Los nombres de campus se muestran siempre como título, aunque se hayan escrito en mayúsculas.
      return (parsed as CampusInfo[]).map(c => ({ ...c, nombre: comoTitulo(c.nombre) }));
    }
    return INITIAL_CAMPUS_UCT;
  } catch (e) {
    console.error('Error leyendo catálogo de campus:', e);
    return INITIAL_CAMPUS_UCT;
  }
}

export function saveCampusList(list: CampusInfo[]): void {
  try {
    guardarConfigCompartida(STORAGE_KEY, list);
  } catch (e) {
    console.error('Error guardando catálogo de campus:', e);
  }
}

/** Archivo de carpetas de Drive que se importa en Configuración → Sedes & Campus (ver importarCarpetasDrive). */
export interface CarpetasDriveArchivo {
  campus: Record<string, { driveUrl?: string; direccion?: string; edificios?: Record<string, { driveUrl?: string; nombre?: string }> }>;
}

const esCarpetaDeDrive = (url: unknown): url is string =>
  typeof url === 'string' && /^https:\/\/drive\.google\.com\/drive\/folders\/[\w-]+/.test(url);

/**
 * Aplica al catálogo las carpetas de Drive de un archivo: enlaza cada campus y edificio, y agrega los edificios
 * que falten. No pisa lo que ya está escrito (enlace o nombre): solo llena lo vacío. Los enlaces quedan en la
 * configuración compartida (Firebase), no en el código, porque el repositorio es público.
 */
export function importarCarpetasDrive(lista: CampusInfo[], archivo: CarpetasDriveArchivo): {
  lista: CampusInfo[];
  campusEnlazados: number;
  direccionesCompletadas: number;
  edificiosEnlazados: number;
  edificiosAgregados: string[];
  campusDesconocidos: string[];
} {
  const resumen = { campusEnlazados: 0, direccionesCompletadas: 0, edificiosEnlazados: 0, edificiosAgregados: [] as string[], campusDesconocidos: [] as string[] };
  const datos = archivo?.campus && typeof archivo.campus === 'object' ? archivo.campus : {};
  resumen.campusDesconocidos = Object.keys(datos).filter(s => !lista.some(c => c.sigla === s.toUpperCase()));
  const nueva = lista.map(campus => {
    const dato = datos[campus.sigla];
    if (!dato) return campus;
    const edificios = [...campus.edificios];
    const info = { ...(campus.edificiosInfo || {}) };
    let driveUrl = campus.driveUrl;
    if (!driveUrl && esCarpetaDeDrive(dato.driveUrl)) {
      driveUrl = dato.driveUrl;
      resumen.campusEnlazados++;
    }
    let direccion = campus.direccion;
    if (!direccion?.trim() && typeof dato.direccion === 'string' && dato.direccion.trim()) {
      direccion = dato.direccion.trim();
      resumen.direccionesCompletadas++;
    }
    for (const [siglaRaw, ed] of Object.entries(dato.edificios || {})) {
      const sigla = siglaRaw.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{2,12}$/.test(sigla)) continue;   // admite espacios comunes del catastro («CSN_110»)
      if (!edificios.includes(sigla)) {
        edificios.push(sigla);
        resumen.edificiosAgregados.push(sigla);
      }
      const actual = info[sigla] || {};
      const enlazar = !actual.driveUrl && esCarpetaDeDrive(ed?.driveUrl);
      if (enlazar) resumen.edificiosEnlazados++;
      info[sigla] = {
        ...actual,
        ...(enlazar ? { driveUrl: ed.driveUrl } : {}),
        ...(!actual.nombre && typeof ed?.nombre === 'string' && ed.nombre.trim() ? { nombre: ed.nombre.trim() } : {}),
      };
    }
    return { ...campus, ...(driveUrl ? { driveUrl } : {}), ...(direccion ? { direccion } : {}), edificios, edificiosInfo: info };
  });
  return { lista: nueva, ...resumen };
}

/** Sigla de un edificio tras cambiar la de su campus (los edificios la llevan de prefijo: CHS01 → CSL01). */
export function renombrarSiglaEdificio(siglaEdificio: string, antigua: string, nueva: string): string {
  return siglaEdificio.startsWith(antigua) ? nueva + siglaEdificio.slice(antigua.length) : siglaEdificio;
}

/** Cambia la sigla de un campus y la de sus edificios, conservando sus fichas. Los proyectos se migran aparte
 * (ver migrarSiglaCampus en firestoreService). */
export function renombrarSiglaCampus(lista: CampusInfo[], antigua: string, nueva: string, nombre?: string): CampusInfo[] {
  return lista.map(campus => {
    if (campus.sigla !== antigua) return campus;
    const edificios = [...new Set(campus.edificios.map(e => renombrarSiglaEdificio(e, antigua, nueva)))];
    const edificiosInfo = Object.fromEntries(
      Object.entries(campus.edificiosInfo || {}).map(([sigla, info]) => [renombrarSiglaEdificio(sigla, antigua, nueva), info])
    );
    return { ...campus, sigla: nueva, nombre: nombre?.trim() || campus.nombre, edificios, edificiosInfo };
  });
}

export function obtenerCampusPorSigla(sigla: string): CampusInfo | undefined {
  return getCampusList().find(c => c.sigla === sigla.toUpperCase());
}

/** Orden natural por sigla: CML2 antes que CML10. */
export function ordenarSiglasEdificio(siglas: string[]): string[] {
  return [...siglas].sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
}

/** Edificios del campus y, al final, sus zonas exteriores (ver ZONAS_EXTERIORES). */
export function obtenerEdificiosDeCampus(siglaCampus: string): string[] {
  if (!siglaCampus) return [];
  const c = getCampusList().find(camp => camp.sigla === siglaCampus.toUpperCase());
  if (!c) return [];
  const zonas = zonasExterioresDeCampus(c.sigla);
  return [...ordenarSiglasEdificio(c.edificios.filter(e => !zonas.includes(e))), ...zonas];
}

/** Ficha de un edificio o zona exterior por su código (ej. "CML01", "CML-CE"), buscando en todos los campus. */
export function obtenerInfoEdificio(siglaEdificio?: string): (EdificioInfo & { sigla: string; campus: CampusInfo; esExterior?: boolean }) | undefined {
  if (!siglaEdificio) return undefined;
  const sigla = siglaEdificio.trim().toUpperCase();
  const lista = getCampusList();
  for (const campus of lista) {
    if (zonasExterioresDeCampus(campus.sigla).includes(sigla)) {
      const zona = zonaExteriorDeCodigo(sigla);
      const editado = campus.edificiosInfo?.[sigla] || {};
      return { ...editado, nombre: editado.nombre || zona?.nombre, uso: editado.uso || zona?.uso, sigla, campus, esExterior: true };
    }
  }
  for (const campus of lista) {
    if (campus.edificios.includes(sigla) || campus.edificiosInfo?.[sigla]) {
      return { ...(campus.edificiosInfo?.[sigla] || {}), sigla, campus };
    }
  }
  return undefined;
}

/** Etiqueta para mostrar un edificio: "CML01 · Edificio Central" (o solo la sigla si no tiene nombre). */
export function etiquetaEdificio(siglaEdificio: string): string {
  const nombre = obtenerInfoEdificio(siglaEdificio)?.nombre;
  return nombre ? `${siglaEdificio} · ${nombre}` : siglaEdificio;
}

/** Ubicación legible de un proyecto: "Campus San Francisco · CSF12 · Edificio Teresa Durán (C)". */
export function ubicacionProyecto(p: { campusSigla?: string; campusNombre?: string; edificioSigla?: string }): string {
  const campus = (p.campusSigla && obtenerCampusPorSigla(p.campusSigla)?.nombre) || p.campusNombre || p.campusSigla || '';
  return [campus, p.edificioSigla ? etiquetaEdificio(p.edificioSigla) : ''].filter(Boolean).join(' · ');
}

/** Texto del edificio para dar contexto a la IA: "edificio CML01 (Biblioteca, Fac. de Educación, 2.450 m², uso docencia)". */
export function descripcionEdificioParaIA(siglaEdificio: string): string {
  const info = obtenerInfoEdificio(siglaEdificio);
  const datos = [
    info?.nombre,
    info?.facultad,
    info?.superficieM2 ? `${info.superficieM2.toLocaleString('es-CL')} m² construidos` : '',
    info?.uso ? `uso ${info.uso}` : '',
    // El punto marcado en el mapa: sitúa la obra dentro del campus y dice cuán lejos queda de Temuco.
    info?.lat != null && info?.lng != null
      ? `ubicado en ${info.lat}, ${info.lng}, a ${distanciaATemucoKm(info.lat, info.lng).toLocaleString('es-CL')} km en línea recta del centro de Temuco`
      : '',
  ].filter(Boolean);
  // Una zona exterior no es un edificio: la obra es a la intemperie, sin recintos interiores.
  const tipo = info?.esExterior ? 'zona exterior del campus, obra a la intemperie' : 'edificio';
  return datos.length ? `${tipo} ${siglaEdificio} (${datos.join(', ')})` : `${tipo} ${siglaEdificio}`;
}

