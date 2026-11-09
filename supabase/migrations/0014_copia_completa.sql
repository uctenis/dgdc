-- 0014: completa la copia de Firestore en Supabase (etapa 1 de la unificación).
-- Agrega lo que la 0011 no cubría: la bitácora de cada proyecto, los contadores de códigos, el registro de archivos
-- (su contenido va al almacenamiento «archivos-sistema») y las fotos del libro de obra. También deja las tablas listas
-- para avisos en vivo y una función que solo cuenta registros, para verificar la copia sin exponer datos.

-- ── Subcolecciones de los proyectos de la Cartera (hoy: bitacoraDesarrollo) ──
create table if not exists public.proyecto_subcolecciones (
  proyecto_id    text not null,
  tipo           text not null,
  id             text not null default gen_random_uuid()::text,
  fecha          text,
  estado         text,
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (proyecto_id, tipo, id)
);
alter table public.proyecto_subcolecciones enable row level security;
drop policy if exists proyecto_sub_uct on public.proyecto_subcolecciones;
create policy proyecto_sub_uct on public.proyecto_subcolecciones
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- ── Contadores de correlativos (Firestore «_counters»: códigos de proyecto) ──
create table if not exists public.contadores (
  id             text primary key,
  datos          jsonb not null default '{}'::jsonb,
  actualizado_en timestamptz not null default now()
);
alter table public.contadores enable row level security;
drop policy if exists contadores_uct on public.contadores;
create policy contadores_uct on public.contadores
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- ── Registro de archivos (el contenido queda en el almacenamiento «archivos-sistema», ruta = id) ──
-- Conserva el mismo id que en Firestore, para que los enlaces «/archivo/{id}» sigan funcionando.
create table if not exists public.archivos (
  id             text primary key,
  nombre         text not null,
  tipo           text,
  tamano         bigint not null default 0,
  acceso         text not null default 'interno' check (acceso in ('interno', 'invitados', 'oferta', 'inscripcion')),
  licitacion_id  text,
  proveedor_id   text,
  inscripcion    text,
  subido_por     text,
  fecha          text,
  ruta           text,               -- ruta en el almacenamiento; null mientras el contenido no se haya copiado
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now()
);
alter table public.archivos enable row level security;
drop policy if exists archivos_uct on public.archivos;
create policy archivos_uct on public.archivos
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());
-- Los proveedores (y las inscripciones sin sesión) seguirán abriendo sus archivos desde Firestore hasta la etapa del
-- portal, donde se les dará acceso por funciones del servidor.

-- ── Historial de auditoría: copia de los registros antiguos de Firestore ──
-- origen_id evita duplicarlos si la copia se repite; solo el administrador del sistema puede insertar registros a
-- nombre de otros (los registros nuevos siguen exigiendo usuario = quien inició sesión).
alter table public.auditoria add column if not exists origen_id text;
create unique index if not exists auditoria_origen_idx on public.auditoria (origen_id);
drop policy if exists auditoria_copia_admin on public.auditoria;
create policy auditoria_copia_admin on public.auditoria
  for insert to anon, authenticated
  with check (public.es_admin_sistema() and origen_id is not null);

-- ── Fotos del libro de obra (subcolección dentro de cada anotación) ──
alter table public.licitacion_subcolecciones drop constraint if exists licitacion_subcolecciones_tipo_check;
alter table public.licitacion_subcolecciones add constraint licitacion_subcolecciones_tipo_check check (tipo in (
  'estadosPago', 'aumentosObra', 'garantias', 'multas', 'aclaraciones',
  'consultas', 'consultasPublicadas', 'envios', 'libroObra', 'libroObraFotos', 'bitacoraDesarrollo', 'control'
));

-- ── Avisos en vivo (equivalente a onSnapshot de Firestore) ──
do $$
declare t text;
begin
  foreach t in array array['configuracion', 'usuarios', 'proveedores', 'evaluaciones_desempeno', 'historial_obras_proveedor',
    'proyectos', 'proyecto_subcolecciones', 'licitaciones', 'licitacion_invitados', 'licitacion_propuestas',
    'licitacion_subcolecciones', 'cotizaciones', 'inscripciones_proveedores', 'auditoria', 'archivos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── Conteo para verificar la copia (solo números, sin datos) ──
create or replace function public.conteo_unificacion()
returns table (tabla text, registros bigint)
language plpgsql stable security definer set search_path = public as $$
declare t text;
begin
  -- Solo el personal UCT (o el lector de verificación). Las sesiones del sitio llegan como «anon» con el token de
  -- Firebase, por eso se valida adentro y no solo con el permiso de ejecución.
  if not (public.es_personal_uct() or session_user = 'lector_claude') then
    raise exception 'Sin permiso para ver los conteos';
  end if;
  foreach t in array array['configuracion', 'usuarios', 'proveedores', 'evaluaciones_desempeno', 'historial_obras_proveedor',
    'proyectos', 'proyecto_subcolecciones', 'contadores', 'licitaciones', 'licitacion_invitados', 'licitacion_propuestas',
    'licitacion_subcolecciones', 'cotizaciones', 'invitaciones_acceso', 'inscripciones_proveedores', 'auditoria', 'archivos'] loop
    tabla := t;
    execute format('select count(*) from public.%I', t) into registros;
    return next;
  end loop;
  -- Subcolecciones de licitación por tipo
  for tabla, registros in select 'licitacion_subcolecciones:' || s.tipo, count(*) from public.licitacion_subcolecciones s group by s.tipo loop
    return next;
  end loop;
  for tabla, registros in select 'archivos_con_contenido', count(*) from public.archivos where ruta is not null loop
    return next;
  end loop;
end $$;
revoke all on function public.conteo_unificacion() from public;
grant execute on function public.conteo_unificacion() to anon, authenticated, lector_claude;
