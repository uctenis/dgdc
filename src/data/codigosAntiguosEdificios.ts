// Equivalencia entre los códigos antiguos de los edificios (los de las láminas anteriores a 2022, como «CSF_A Lam01» o
// «CML_MLA Lam02») y los códigos actuales. Se obtuvo de la columna «código antiguo» del catastro (Rev. Noviembre 2026),
// en la que cada recinto anota su código anterior: un código antiguo corresponde al edificio donde están la mayoría
// de sus recintos. Solo contiene códigos de edificios.

/** Por campus actual: código antiguo del edificio → código actual. */
export const CODIGOS_ANTIGUOS: Record<string, Record<string, string>> = {
  CBQ: { BQ6: 'CBQ03' },
  CEC: { CEC: 'CEC01' },
  CJP: {
    '15': 'CJP15', CEC: 'CEC01', ARQ: 'CJP02', CAS: 'CJP05', CD: 'CJP12', 'CT+': 'CJP10', CT: 'CJP08', DIS: 'CJP02', EB: 'CJP07', EB1: 'CJP07', EB2: 'CJP07', EB3: 'CJP07',
    EDU: 'CJP03', EEA: 'CJP09', EPA: 'CJP04', FAAD: 'CJP01', FADD: 'CJP01', GAR2: 'CJP102', GIM2: 'CJP13', INV: 'CJP16', RK: 'CJP14', TJM: 'CJP06',
  },
  CML: { MLA: 'CML01', MLB: 'CML05', MLC: 'CML04', MLD: 'CML03', MLE: 'CML02' },
  CPH: { PHA: 'CPH01', PHB: 'CPH02', PHC: 'CPH03' },
  CPL: { PHL: 'CPL08', PLA: 'CPL02', PLB: 'CPL01', PLC: 'CPL03', PLD: 'CPL04', PLE: 'CPL05', PLF: 'CPL06', PLG: 'CPL07', PLI: 'CPL09', PLJ: 'CPL10' },
  CRC: {
    '8': 'CRC08', '9': 'CRC09', ANA: 'CRC05', BAN: 'CRC101', 'BAÑ': 'CRC101', CMA: 'CRC07', CME: 'CRC01', EDI: 'CRC09', GAL1: 'CRC17', GAL2: 'CRC18', GAL3: 'CRC115',
    MAC: 'CRC03', PAT: 'CRC06', RAN: 'CRC02',
  },
  CSC: { CA: 'CSC01', CB: 'CSC02', CC: 'CSC03' },
  CSD: { SCL: 'CSD01' },
  CSF: {
    A: 'CSF16', B: 'CSF14', BQ697: 'CSF10', C: 'CSF12', D: 'CSF02', E: 'CSF03', F: 'CSF05', H: 'CSF09', I: 'CSF08', J: 'CSF07', K: 'CSF17', P: 'CSF01',
    RF: 'CSF13', U: 'CSF11', V: 'CSF06', X: 'CSF04',
  },
  CTH: { TH: 'CTH01' },
};

/** Siglas antiguas de campus que aparecen en los nombres de archivo («CCC_CA lam02» es Sergio Contreras). */
export const SIGLAS_ANTIGUAS: Record<string, string> = { CCC: 'CSC', PH622: 'CPH' };

/** Prefijos antiguos de edificio con número, como el actual («CHS01» pasó a ser «CSL01»). */
export const PREFIJOS_ANTIGUOS: Record<string, string> = { CHS: 'CSL' };

/** Código actual del edificio a partir de su código antiguo dentro de un campus, o null si no se conoce. */
export function edificioActual(siglaCampus: string, codigoAntiguo: string): string | null {
  const campus = SIGLAS_ANTIGUAS[siglaCampus.toUpperCase()] || siglaCampus.toUpperCase();
  return CODIGOS_ANTIGUOS[campus]?.[codigoAntiguo.toUpperCase()] || null;
}
