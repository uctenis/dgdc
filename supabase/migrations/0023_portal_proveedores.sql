-- 0023: etapa 3 de la unificación — el portal de proveedores funciona sobre Supabase.
--
-- Con la 0013 la base quedó cerrada para todo el que no fuera personal UCT, y el portal dejó de funcionar: el
-- proveedor no podía validar su invitación, ni tener perfil, ni guardar su oferta o sus consultas. Aquí se le abre
-- exactamente lo que le permitían las reglas de Firestore (reglas-sugeridas/firestore.rules), validado en la base:
--
--   1. Su identidad: el perfil en «usuarios» lo crea una función que comprueba la invitación (código secreto del
--      enlace + correo verificado de la sesión). El proveedor no escribe su perfil directamente.
--   2. Invitación e inscripción por código: funciones que responden solo a quien trae el código, sin listar nada.
--   3. Sus escrituras (oferta, consultas, constancia de acceso, aclaraciones vistas, recepción conforme): reglas
--      acotadas a SU registro y disparadores que revisan campo por campo y el plazo con el reloj del SERVIDOR.
--
-- Los disparadores solo actúan sobre las consultas del sitio (roles anon y authenticated) que no son del personal
-- UCT; el personal y las tareas de administración siguen igual.

-- ── Ayudas ──────────────────────────────────────────────────────────────────────────────────────────

-- Correo de la sesión, solo si está verificado (Google y el enlace por correo lo verifican).
create or replace function public.correo_verificado() returns text
language sql stable as $$
  select case when coalesce((auth.jwt() ->> 'email_verified')::boolean, false)
              then lower(trim(coalesce(auth.jwt() ->> 'email', ''))) else '' end
$$;

-- ¿La consulta viene de un proveedor (o de alguien sin sesión) a través del sitio?
create or replace function public.es_acceso_externo() returns boolean
language sql stable as $$
  select current_user in ('anon', 'authenticated') and not public.es_personal_uct()
$$;

-- Campos de primer nivel que difieren entre dos documentos.
create or replace function public.claves_cambiadas(a jsonb, b jsonb) returns text[]
language sql immutable as $$
  select coalesce(array_agg(distinct k), '{}'::text[]) from (
    select key as k from jsonb_each(coalesce(a, '{}'::jsonb)) x
      where (coalesce(b, '{}'::jsonb) -> x.key) is distinct from x.value
    union all
    select key from jsonb_each(coalesce(b, '{}'::jsonb)) y
      where not coalesce(a, '{}'::jsonb) ? y.key
  ) s
$$;

-- El portal cierra a la hora: se compara con el reloj del servidor. Sin hora de cierre, no hay límite.
create or replace function public.dentro_de_plazo(lic_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select limite_ofertas_ms from public.licitaciones where id = lic_id), 9999999999999)
         >= (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

-- ── 1. Invitación y perfil del proveedor ────────────────────────────────────────────────────────────

-- Comprueba un enlace de invitación: el código debe ser de esa licitación y el correo, el invitado. Con sesión se usa
-- el correo verificado de la sesión (o un perfil ya vinculado a esa empresa); sin sesión, el correo que se indique
-- (antes de enviar el enlace de ingreso). Devuelve la invitación o null; nunca lista nada.
create or replace function public.portal_verificar_invitacion(p_lic text, p_token text, p_email text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_correo text := coalesce(nullif(public.correo_verificado(), ''), lower(trim(coalesce(p_email, ''))));
  r public.invitaciones_acceso;
begin
  if coalesce(p_lic, '') = '' or coalesce(p_token, '') = '' then return null; end if;
  select * into r from public.invitaciones_acceso where token = p_token and licitacion_id = p_lic;
  if not found then return null; end if;
  -- (coalesce: una comparación con un valor vacío no debe dejar pasar a nadie)
  if not coalesce(
    (v_correo <> '' and lower(trim(r.proveedor_email)) = v_correo)
    or (public.uid_sesion() <> '' and public.mi_proveedor_id() is not null and public.mi_proveedor_id() = r.proveedor_id),
    false
  ) then
    return null;
  end if;
  return jsonb_build_object('token', r.token, 'licitacionId', r.licitacion_id, 'proveedorId', r.proveedor_id,
    'proveedorEmail', r.proveedor_email, 'proveedorNombre', r.proveedor_nombre);
end $$;
revoke all on function public.portal_verificar_invitacion(text, text, text) from public;
grant execute on function public.portal_verificar_invitacion(text, text, text) to anon, authenticated;

-- Crea o actualiza el perfil de proveedor de la sesión a partir de una invitación válida. Devuelve el perfil.
create or replace function public.portal_vincular(p_lic text, p_token text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_uid text := public.uid_sesion();
  v_correo text := public.correo_verificado();
  v_inv jsonb;
  v_previo public.usuarios;
  v_perfil jsonb;
begin
  if v_uid = '' or v_correo = '' then raise exception 'SIN_SESION'; end if;
  if v_correo like '%@uct.cl' then raise exception 'CUENTA_INTERNA'; end if;
  v_inv := public.portal_verificar_invitacion(p_lic, p_token, null);
  if v_inv is null then raise exception 'NO_INVITADO'; end if;
  select * into v_previo from public.usuarios where uid = v_uid;
  if found and v_previo.role <> 'proveedor' then raise exception 'INVALID_ROLE'; end if;

  v_perfil := coalesce(v_previo.datos, '{}'::jsonb) || jsonb_build_object(
    'uid', v_uid, 'email', v_correo, 'role', 'proveedor',
    'displayName', coalesce(nullif(v_previo.display_name, ''), v_inv->>'proveedorNombre'),
    'proveedorId', v_inv->>'proveedorId', 'tokenInvitacion', p_token,
    'fechaRegistro', coalesce(v_previo.datos->>'fechaRegistro', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'verificado', true);
  insert into public.usuarios (uid, email, role, display_name, proveedor_id, token_invitacion, verificado, datos, actualizado_en)
  values (v_uid, v_correo, 'proveedor', v_perfil->>'displayName', v_inv->>'proveedorId', p_token, true, v_perfil, now())
  on conflict (uid) do update set
    email = excluded.email, proveedor_id = excluded.proveedor_id, token_invitacion = excluded.token_invitacion,
    display_name = excluded.display_name, datos = excluded.datos, actualizado_en = now();
  return v_perfil;
end $$;
revoke all on function public.portal_vincular(text, text) from public;
grant execute on function public.portal_vincular(text, text) to authenticated, anon;

-- ── 2. Inscripción de proveedores por código (página sin sesión) ───────────────────────────────────

create or replace function public.inscripcion_leer(p_codigo text) returns jsonb
language sql stable security definer set search_path = public as $$
  select datos || jsonb_build_object('estado', estado) from public.inscripciones_proveedores
  where codigo = p_codigo and coalesce(p_codigo, '') <> ''
$$;
revoke all on function public.inscripcion_leer(text) from public;
grant execute on function public.inscripcion_leer(text) to anon, authenticated;

-- La empresa guarda su avance o lo envía a revisión, solo mientras esté «Invitada» u «Observada», y solo sus datos,
-- documentos y declaración de sustentabilidad.
create or replace function public.inscripcion_guardar(p_codigo text, p_cambios jsonb, p_enviar boolean) returns void
language plpgsql volatile security definer set search_path = public as $$
declare v_estado text; v_extra text[];
begin
  select estado into v_estado from public.inscripciones_proveedores where codigo = p_codigo for update;
  if not found then raise exception 'NO_EXISTE'; end if;
  if v_estado not in ('Invitada', 'Observada') then raise exception 'INSCRIPCION_CERRADA'; end if;
  select array_agg(k) into v_extra from jsonb_object_keys(coalesce(p_cambios, '{}'::jsonb)) k
    where k not in ('datos', 'documentos', 'sustentabilidad');
  if v_extra is not null then raise exception 'CAMPO_NO_PERMITIDO: %', array_to_string(v_extra, ', '); end if;
  update public.inscripciones_proveedores
     set datos = datos || coalesce(p_cambios, '{}'::jsonb) || case when p_enviar
           then jsonb_build_object('estado', 'Enviada', 'fechaEnvio', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
           else '{}'::jsonb end
   where codigo = p_codigo;
end $$;
revoke all on function public.inscripcion_guardar(text, jsonb, boolean) from public;
grant execute on function public.inscripcion_guardar(text, jsonb, boolean) to anon, authenticated;

-- ── 3. Escrituras del proveedor en su licitación ───────────────────────────────────────────────────

-- 3a. Su invitación: constancia de acceso, estado de su oferta y aclaraciones vistas.
drop policy if exists lic_invitados_proveedor on public.licitacion_invitados;
create policy lic_invitados_proveedor on public.licitacion_invitados
  for update to anon, authenticated
  using (proveedor_id = public.mi_proveedor_id())
  with check (proveedor_id = public.mi_proveedor_id());

create or replace function public.validar_invitado_proveedor() returns trigger
language plpgsql as $$
declare v_extra text[];
begin
  if not public.es_acceso_externo() then return new; end if;
  if new.licitacion_id <> old.licitacion_id or new.proveedor_id <> old.proveedor_id then raise exception 'CAMPO_NO_PERMITIDO: claves'; end if;
  select array_agg(k) into v_extra from unnest(public.claves_cambiadas(old.datos, new.datos)) k
    where k not in ('estadoPropuesta', 'fechaPresentacion', 'primerAcceso', 'ultimoAcceso', 'cantidadAccesos', 'aclaracionesVistas', '_updatedAt');
  if v_extra is not null then raise exception 'CAMPO_NO_PERMITIDO: %', array_to_string(v_extra, ', '); end if;
  return new;
end $$;
drop trigger if exists validar_proveedor on public.licitacion_invitados;
create trigger validar_proveedor before update on public.licitacion_invitados
  for each row execute function public.validar_invitado_proveedor();

-- 3b. Su oferta: la crea y la modifica dentro del plazo; una vez enviada ya no la cambia (salvo la constancia de
-- confirmación por correo).
drop policy if exists lic_propuestas_proveedor_crear on public.licitacion_propuestas;
create policy lic_propuestas_proveedor_crear on public.licitacion_propuestas
  for insert to anon, authenticated
  with check (proveedor_id = public.mi_proveedor_id() and public.es_invitado_licitacion(licitacion_id));
drop policy if exists lic_propuestas_proveedor_modificar on public.licitacion_propuestas;
create policy lic_propuestas_proveedor_modificar on public.licitacion_propuestas
  for update to anon, authenticated
  using (proveedor_id = public.mi_proveedor_id())
  with check (proveedor_id = public.mi_proveedor_id() and public.es_invitado_licitacion(licitacion_id));

create or replace function public.validar_propuesta_proveedor() returns trigger
language plpgsql as $$
begin
  if not public.es_acceso_externo() then return new; end if;
  if coalesce(new.datos ->> 'proveedorUid', '') <> public.uid_sesion() then raise exception 'PROPUESTA_DE_OTRA_CUENTA'; end if;
  if tg_op = 'INSERT' then
    if not public.dentro_de_plazo(new.licitacion_id) then raise exception 'PLAZO_CERRADO'; end if;
  else
    if new.licitacion_id <> old.licitacion_id or new.proveedor_id <> old.proveedor_id then raise exception 'CAMPO_NO_PERMITIDO: claves'; end if;
    if not ((coalesce(old.datos ->> 'estado', '') <> 'Enviada' and public.dentro_de_plazo(new.licitacion_id))
            or public.claves_cambiadas(old.datos, new.datos) <@ array['confirmacionCorreo', '_updatedAt']) then
      raise exception '%', case when coalesce(old.datos ->> 'estado', '') = 'Enviada' then 'PROPUESTA_YA_ENVIADA' else 'PLAZO_CERRADO' end;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists validar_proveedor on public.licitacion_propuestas;
create trigger validar_proveedor before insert or update on public.licitacion_propuestas
  for each row execute function public.validar_propuesta_proveedor();

-- 3c. Sus consultas: solo crearlas, dentro del plazo, con los campos de una pregunta nueva.
drop policy if exists lic_sub_proveedor_consulta on public.licitacion_subcolecciones;
create policy lic_sub_proveedor_consulta on public.licitacion_subcolecciones
  for insert to anon, authenticated
  with check (tipo = 'consultas' and proveedor_id = public.mi_proveedor_id() and public.es_invitado_licitacion(licitacion_id));

create or replace function public.validar_consulta_proveedor() returns trigger
language plpgsql as $$
declare v_extra text[];
begin
  if not public.es_acceso_externo() then return new; end if;
  if new.tipo <> 'consultas' then raise exception 'NO_PERMITIDO'; end if;
  select array_agg(k) into v_extra from jsonb_object_keys(new.datos) k
    where k not in ('proveedorId', 'proveedorNombre', 'proveedorUid', 'pregunta', 'fechaPregunta', 'estado', '_createdAt');
  if v_extra is not null then raise exception 'CAMPO_NO_PERMITIDO: %', array_to_string(v_extra, ', '); end if;
  if coalesce(new.datos ->> 'estado', '') <> 'Pendiente'
     or coalesce(new.datos ->> 'proveedorUid', '') <> public.uid_sesion()
     or coalesce(jsonb_typeof(new.datos -> 'pregunta'), '') <> 'string'
     or length(new.datos ->> 'pregunta') > 2000 then
    raise exception 'CONSULTA_NO_VALIDA';
  end if;
  if not public.dentro_de_plazo(new.licitacion_id) then raise exception 'PLAZO_CERRADO'; end if;
  return new;
end $$;
drop trigger if exists validar_proveedor on public.licitacion_subcolecciones;
create trigger validar_proveedor before insert or update on public.licitacion_subcolecciones
  for each row execute function public.validar_consulta_proveedor();

-- 3d. El proveedor adjudicado solo puede solicitar la recepción conforme.
drop policy if exists licitaciones_adjudicado on public.licitaciones;
create policy licitaciones_adjudicado on public.licitaciones
  for update to anon, authenticated
  using (proveedor_ganador_id = public.mi_proveedor_id() and public.es_invitado_licitacion(id))
  with check (proveedor_ganador_id = public.mi_proveedor_id());

create or replace function public.validar_licitacion_proveedor() returns trigger
language plpgsql as $$
declare v_extra text[];
begin
  if not public.es_acceso_externo() then return new; end if;
  select array_agg(k) into v_extra from unnest(public.claves_cambiadas(old.datos, new.datos)) k
    where k not in ('recepcionConforme', 'estadoLifecycle', '_updatedAt');
  if v_extra is not null then raise exception 'CAMPO_NO_PERMITIDO: %', array_to_string(v_extra, ', '); end if;
  return new;
end $$;
drop trigger if exists validar_proveedor on public.licitaciones;
create trigger validar_proveedor before update on public.licitaciones
  for each row execute function public.validar_licitacion_proveedor();
