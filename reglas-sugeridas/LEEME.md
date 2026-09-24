# Reglas de Firebase para aislar al proveedor

Estas reglas son lo que **realmente** impide que un proveedor vea algo distinto de su invitación. Las rutas y
pantallas de la app solo esconden cosas; un proveedor con sesión podría consultar Firebase directamente, y hoy
las reglas no distinguen entre proveedores y personal interno (no hay archivo de reglas en el repositorio, así que
no sé cómo están ahora).

**No están desplegadas.** Al aplicarlas reemplazan las reglas actuales.

## Qué garantizan

- **Personal interno** = cuenta Google verificada `@uct.cl`: acceso completo, como hoy.
- **Proveedor**, y solo si su cuenta se vinculó a una invitación real (código del enlace + correo invitado):
  - lee únicamente **la licitación a la que fue invitado**, su propia invitación y la ficha de su propia empresa;
  - lee y escribe únicamente **su** propuesta, y no puede modificarla una vez enviada;
  - sube archivos solo a su carpeta `licitaciones/{id}/ofertas/{su id}/`;
  - no puede listar invitados, otras propuestas, otros proveedores, proyectos ni nada del sistema interno.
- **El portal cierra a la hora indicada**, medida con el reloj del servidor de Firebase: pasada la hora de cierre no se puede crear ni modificar la propuesta ni subir archivos, aunque el proveedor cambie la hora de su computador. Depende del campo `limiteOfertasMs` que la app calcula al guardar la licitación (fecha + hora, hora de Chile); las licitaciones anteriores lo reciben al enviar la invitación.
- Un proveedor no puede crearse un perfil con otro rol ni vincularse a otra empresa.

## Cómo aplicarlas (con cuidado)

1. Firebase Console → Firestore Database → **Rules** → pegar `firestore.rules` → usar el **Simulador de reglas**
   (Rules Playground) antes de publicar: probar un usuario `@uct.cl` (debe poder todo) y uno no interno.
2. Firebase Console → Storage → **Rules** → pegar `storage.rules`.
3. Volver a desplegar las funciones: `firebase deploy --only functions` (`enviarInvitacionesLicitacion` ahora publica
   `invitaciones/{código}`; `confirmarPropuestaEnviada` es nueva).
4. Reenviar la invitación (aunque sea simulada) para que cada invitado quede publicado en `invitaciones/`.
5. Probar con una cuenta de proveedor real antes del lanzamiento.

## Puntos a revisar

- Si algún funcionario usa un correo que **no** es `@uct.cl`, agréguelo a `esInterno()` en ambos archivos.
- Con estas reglas el acceso al sistema interno exige sesión real de Firebase (Google `@uct.cl`); el "acceso local
  de desarrollo" sin sesión no podrá leer datos.
- El enlace de invitación es un secreto por proveedor. Si se filtra, se puede regenerar borrando al invitado y
  volviéndolo a invitar.
