# React + TypeScript + Vite

## Google Drive

Copie `.env.example` como `.env.local` y configure `VITE_GOOGLE_DRIVE_CLIENT_ID` con un cliente OAuth 2.0 web. En Google Cloud habilite Google Drive API y registre `http://localhost:5180` como origen JavaScript autorizado. La aplicación solicitará el alcance `drive.file` al cargar ofertas, órdenes de compra y respaldos de estados de pago.

## Firma con Adobe Acrobat Sign

La firma se ejecuta mediante Acrobat Sign y no expone credenciales de Adobe en el navegador. La función HTTPS incluida en `functions/` crea el acuerdo, entrega al usuario autenticado su URL de firma, consulta el estado y devuelve el PDF final firmado. El frontend conserva exactamente los bytes entregados por Adobe, calcula su SHA-256 y, cuando Drive está autorizado, guarda esa copia en la carpeta del proyecto.

Requisitos:

1. Crear una aplicación OAuth en Acrobat Sign con permisos `agreement_write` y `agreement_read`, y obtener un refresh token de una cuenta remitente habilitada.
2. Configurar los secretos de Firebase Functions:

   ```bash
   firebase functions:secrets:set ADOBE_SIGN_CLIENT_ID
   firebase functions:secrets:set ADOBE_SIGN_CLIENT_SECRET
   firebase functions:secrets:set ADOBE_SIGN_REFRESH_TOKEN
   ```

   Si la cuenta no reside en el shard `na1`, configure además el parámetro `ADOBE_SIGN_API_ACCESS_POINT` con el `api_access_point` entregado por OAuth (por ejemplo, `https://api.eu1.adobesign.com`).

3. Instalar y desplegar la función:

   ```bash
   npm --prefix functions install
   firebase deploy --only functions:adobeSignApi
   ```

4. Copiar la URL HTTPS desplegada a `VITE_ADOBE_SIGN_API_URL` en `.env.local` y volver a compilar el frontend.

Todos los firmantes oficiales deben tener un correo institucional configurado. Acrobat Sign controla la secuencia y aplica la firma; la aplicación solo marca el acta como `Firmada` después de que la API de Adobe informa `SIGNED` o `APPROVED` y permite recuperar el documento combinado final.

## Acceso interno con Google y firma de estados de pago

El panel interno exige una cuenta Google institucional autorizada. En Firebase Console habilite **Authentication → Sign-in method → Google** y agregue `uctenis.github.io` a **Authentication → Settings → Authorized domains**. El correo `dsilva@uct.cl` se reconoce como administrador; el director, subdirector y responsables activos se validan contra la nómina configurada en la aplicación.

Cada estado de pago queda pendiente hasta que ingresa el correo Google asignado en `responsableEmail` del proyecto. La función `firmarEstadoPago` vuelve a validar el token y la coincidencia del correo en servidor, impide firmas duplicadas y registra identidad, fecha y SHA-256 del contenido aprobado.

Despliegue la validación segura con:

```bash
firebase deploy --only functions:firmarEstadoPago
```

## Control contractual y desarrollo del proyecto

La ficha mantiene tres capas separadas para conservar la trazabilidad:

1. **Contrato original:** oferta adjudicada, itemizado, monto y plazo originales; nunca se sobrescriben.
2. **Aumentos de obra:** cada modificación registra fundamento, orden de compra, fecha, partidas delta, monto neto/IVA/total, ampliación de plazo y respaldo. El responsable prepara el borrador y el administrador lo aprueba desde la interfaz.
3. **Contrato vigente:** suma automática del contrato original y los aumentos aprobados. Sus partidas, monto, plazo y fecha de término alimentan el control de avance.

Los estados de pago son secuenciales. No se habilita uno nuevo mientras el anterior esté pendiente de firma ni cuando el avance físico o financiero del contrato vigente llegue al 100 %. Un aumento aprobado agrega alcance y saldo, y vuelve a habilitar el avance exclusivamente sobre las partidas incorporadas.

La **Bitácora de desarrollo** registra hitos, reuniones, inspecciones, decisiones, riesgos, incidencias y recepciones con responsable, estado e impactos estimados en costo y plazo.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
