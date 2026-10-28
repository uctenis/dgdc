# Guías de Desarrollo - DGDC Gestión de Licitaciones

Este proyecto es una aplicación web SPA construida con **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4** y **Firebase/Firestore**.

## Pautas y Estándares

### 1. TypeScript y Tipado
- Utilizar tipado estricto en interfaces de modelos (`Proyecto`, `Licitacion`, `Factura`, `Responsable`).
- Evitar el uso de `any`; definir tipos explícitos para estados, eventos y propiedades de componentes (`props`).
- Los tipos y modelos compartidos se organizan en `src/types/` o junto a sus servicios.

### 2. Estilos y Diseño
- Usar clases de utilidades de **Tailwind CSS v4**.
- Respetar la paleta de colores institucional y el diseño responsive establecido (modales accesibles, tablas responsivas).
- Mantener consistencia visual en iconos (`lucide-react`) y feedback al usuario.

### 3. Servicios y Firebase / Firestore
- Las llamadas a Firestore deben manejarse a través de módulos dedicados en `src/services/` o contextos (`src/context/`).
- Manejar adecuadamente errores (`try/catch`) y estados de carga (`loading`, `isSubmitting`).
- Validar permisos de autenticación y dominios permitidos (`uct.cl` u roles internos definidos).

### 4. Scripts y Validación
- Para verificación de código rápido: `npm run lint` (utiliza `oxlint`).
- Para validación de tipos y empaquetado: `npm run build` (`tsc -b && vite build`).
- Servidor de desarrollo: `npm run dev` (puerto predeterminado `5180`).
