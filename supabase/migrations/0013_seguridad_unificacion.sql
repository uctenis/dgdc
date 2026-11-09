-- 0013: endurece las reglas de las tablas creadas en 0011 (unificación en Supabase).
--
-- Mientras Firestore siga siendo la fuente de los datos, las tablas de 0011 son una COPIA que solo escribe el personal
-- UCT (la sincronización del administrador y las escrituras en vivo del sistema). Los proveedores todavía trabajan
-- contra Firestore; cuando el portal se mude a Supabase, sus permisos de escritura se darán por funciones del servidor
-- que validen el token de invitación, no por reglas abiertas.
--
-- Problemas que corrige (la clave pública de Supabase está en el sitio: las reglas son la única protección):
--   1. inscripciones_proveedores: cualquiera, incluso sin sesión, podía leerlas todas y modificar las «Invitada».
--   2. usuarios: un proveedor con sesión podía escribir su perfil con el proveedor_id de otra empresa (y así leer sus
--      propuestas) o con role = 'admin'.
--   3. invitaciones_acceso: cualquier sesión podía listar todos los tokens secretos de invitación.
--   4. almacenamiento «archivos-sistema»: cualquier sesión podía leer y escribir todos los archivos.
--   5. licitacion_invitados / licitacion_propuestas: un proveedor podía escribir sin control de plazo ni estado.

-- 1. Inscripciones: solo personal UCT.
drop policy if exists inscripciones_lectura on public.inscripciones_proveedores;
create policy inscripciones_lectura on public.inscripciones_proveedores
  for select to anon, authenticated
  using (public.es_personal_uct());

drop policy if exists inscripciones_escritura on public.inscripciones_proveedores;
create policy inscripciones_escritura on public.inscripciones_proveedores
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- 2. Usuarios: cada uno puede leer su propio perfil; solo el personal UCT los escribe.
drop policy if exists usuarios_escritura on public.usuarios;
create policy usuarios_escritura on public.usuarios
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- 3. Tokens de invitación: solo personal UCT.
drop policy if exists invitaciones_acceso_lectura on public.invitaciones_acceso;
create policy invitaciones_acceso_lectura on public.invitaciones_acceso
  for select to anon, authenticated
  using (public.es_personal_uct());

-- 4. Archivos del sistema: solo personal UCT.
drop policy if exists archivos_sistema_uct on storage.objects;
create policy archivos_sistema_uct on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'archivos-sistema' and public.es_personal_uct())
  with check (bucket_id = 'archivos-sistema' and public.es_personal_uct());

-- 5. Invitados y propuestas: el proveedor puede LEER lo suyo; escribir, solo el personal UCT.
drop policy if exists lic_invitados_escritura on public.licitacion_invitados;
create policy lic_invitados_escritura on public.licitacion_invitados
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

drop policy if exists lic_propuestas_acceso on public.licitacion_propuestas;
drop policy if exists lic_propuestas_lectura on public.licitacion_propuestas;
create policy lic_propuestas_lectura on public.licitacion_propuestas
  for select to anon, authenticated
  using (public.es_personal_uct() or proveedor_id = public.mi_proveedor_id());
drop policy if exists lic_propuestas_escritura on public.licitacion_propuestas;
create policy lic_propuestas_escritura on public.licitacion_propuestas
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- Las consultas de proveedores (licitacion_subcolecciones, tipo «consultas») también pasan a escribirse solo desde
-- el sistema mientras el portal funcione con Firestore.
drop policy if exists lic_sub_escritura on public.licitacion_subcolecciones;
create policy lic_sub_escritura on public.licitacion_subcolecciones
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());
