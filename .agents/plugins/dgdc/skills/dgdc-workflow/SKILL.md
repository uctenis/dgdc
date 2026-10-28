---
name: dgdc-workflow
description: >-
  Proporciona las instrucciones y procedimientos operativos para el desarrollo,
  pruebas, linting y despliegue del proyecto DGDC Gestión de Licitaciones.
  Úsalo cuando se agreguen o modifiquen componentes, modales, servicios de Firestore o se preparen entregas.
---

# Flujo de Trabajo DGDC Licitaciones

Instrucciones y procedimientos para el desarrollo en el repositorio DGDC.

## 1. Verificación y Calidad de Código
Antes de dar por completado un cambio importante:
1. Ejecutar linting rápido:
   ```bash
   npm run lint
   ```
2. Validar que no existan errores de compilación de TypeScript:
   ```bash
   npx tsc --noEmit
   ```
3. Comprobar el empaquetado de producción:
   ```bash
   npm run build
   ```

## 2. Convenciones de Componentes y Modales
- Los modales deben incluir botones de cierre accesibles (`X` y `Esc`).
- La interacción con Firestore debe contar con estados de feedback visual (notificaciones, deshabilitación de botones al guardar).
- Los archivos exportados (Excel, PDF, Word) usan las librerías integradas (`exceljs`, `jspdf`, `docx`).

## 3. Servicios y Datos
- Scripts de carga o migración a Firestore se ubican en `scripts/` (ej. `scripts/uploadProjectsToFirestore.cjs`).
- Servicios de autenticación y acceso interno en `src/services/internalAccessService.ts` y `src/context/AuthContext.tsx`.
