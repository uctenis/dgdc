-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0011: Unificación completa del sistema en Supabase (PostgreSQL + Storage)
-- Reemplaza las colecciones de Firestore (configuración, usuarios, proveedores, proyectos, licitaciones,
-- cotizaciones, subcolecciones de obra, inscripciones, auditoría y archivos) en una sola base de datos
-- relacional con Row Level Security (RLS).
-- ════════════════════════════════════════════════════════════════════════════════════════════════════

-- ── Funciones auxiliares de sesión y permisos ───────────────────────────────────────────────────────
create or replace function public.uid_sesion() returns text
language sql stable as $$ select coalesce(auth.jwt() ->> 'sub', '') $$;

create or replace function public.es_admin_sistema() returns boolean
language sql stable as $$
  select public.es_personal_uct() and public.correo_sesion() = 'dsilva@uct.cl'
$$;

-- ── 1. Configuración compartida (catálogos, nómina, plantillas, firmas) ─────────────────────────────
create table if not exists public.configuracion (
  id                  text primary key,
  valor               text not null,
  actualizado_por     text,
  fecha_actualizacion timestamptz not null default now()
);
alter table public.configuracion enable row level security;

drop policy if exists configuracion_lectura_uct on public.configuracion;
create policy configuracion_lectura_uct on public.configuracion
  for select to anon, authenticated
  using (public.es_personal_uct());

drop policy if exists configuracion_escritura_admin on public.configuracion;
create policy configuracion_escritura_admin on public.configuracion
  for all to anon, authenticated
  using (public.es_admin_sistema())
  with check (public.es_admin_sistema());

-- ── 2. Perfiles de usuarios (personal interno y proveedores invitados) ──────────────────────────────
create table if not exists public.usuarios (
  uid              text primary key,
  email            text not null,
  role             text not null check (role in ('admin', 'responsable', 'proveedor')),
  display_name     text,
  proveedor_id     text,
  token_invitacion text,
  fecha_registro   timestamptz not null default now(),
  verificado       boolean not null default true,
  datos            jsonb not null default '{}'::jsonb,
  actualizado_en   timestamptz not null default now()
);
alter table public.usuarios enable row level security;

drop policy if exists usuarios_lectura on public.usuarios;
create policy usuarios_lectura on public.usuarios
  for select to anon, authenticated
  using (public.es_personal_uct() or (public.uid_sesion() <> '' and uid = public.uid_sesion()));

drop policy if exists usuarios_escritura on public.usuarios;
create policy usuarios_escritura on public.usuarios
  for all to anon, authenticated
  using (public.es_personal_uct() or (public.uid_sesion() <> '' and uid = public.uid_sesion()))
  with check (public.es_personal_uct() or (public.uid_sesion() <> '' and uid = public.uid_sesion()));

-- Función auxiliar para saber si la sesión actual es de un proveedor y cuál es su proveedor_id
create or replace function public.mi_proveedor_id() returns text
language sql stable security definer set search_path = public as $$
  select proveedor_id from public.usuarios
  where uid = public.uid_sesion() and role = 'proveedor'
  limit 1
$$;

-- ── 3. Proveedores y sus subcolecciones (evaluaciones de desempeño e historial de obras) ────────────
create table if not exists public.proveedores (
  id             text primary key default gen_random_uuid()::text,
  rut            text not null,
  razon_social   text not null,
  email          text,
  estado         text not null default 'Activo',
  fecha_registro timestamptz not null default now(),
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists proveedores_fecha_idx on public.proveedores (fecha_registro desc);
alter table public.proveedores enable row level security;

drop policy if exists proveedores_lectura on public.proveedores;
create policy proveedores_lectura on public.proveedores
  for select to anon, authenticated
  using (public.es_personal_uct() or id = public.mi_proveedor_id());

drop policy if exists proveedores_escritura_uct on public.proveedores;
create policy proveedores_escritura_uct on public.proveedores
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

create table if not exists public.evaluaciones_desempeno (
  id             text primary key default gen_random_uuid()::text,
  proveedor_id   text not null references public.proveedores(id) on delete cascade,
  licitacion_id  text,
  fecha          text not null,
  puntaje_final  numeric(5, 2),
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists eval_desempeno_prov_idx on public.evaluaciones_desempeno (proveedor_id, fecha desc);
alter table public.evaluaciones_desempeno enable row level security;

drop policy if exists eval_desempeno_uct on public.evaluaciones_desempeno;
create policy eval_desempeno_uct on public.evaluaciones_desempeno
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

create table if not exists public.historial_obras_proveedor (
  id             text not null,
  proveedor_id   text not null references public.proveedores(id) on delete cascade,
  licitacion_id  text not null,
  fecha          text,
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  primary key (proveedor_id, id)
);
alter table public.historial_obras_proveedor enable row level security;

drop policy if exists historial_obras_uct on public.historial_obras_proveedor;
create policy historial_obras_uct on public.historial_obras_proveedor
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- ── 4. Proyectos de la Cartera (Proyectos Maestros) ─────────────────────────────────────────────────
create table if not exists public.proyectos (
  id               text primary key default gen_random_uuid()::text,
  correlativo      integer not null default 1,
  codigo_proyecto  text not null,
  nombre           text not null,
  anio_presupuesto integer,
  campus_sigla     text,
  edificio_sigla   text,
  estado           text,
  gasto_efectivo   numeric(14, 2) default 0,
  datos            jsonb not null default '{}'::jsonb,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index if not exists proyectos_correlativo_idx on public.proyectos (correlativo asc);
create index if not exists proyectos_codigo_idx on public.proyectos (codigo_proyecto);
alter table public.proyectos enable row level security;

drop policy if exists proyectos_uct on public.proyectos;
create policy proyectos_uct on public.proyectos
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- ── 5. Licitaciones y subcolecciones ────────────────────────────────────────────────────────────────
create table if not exists public.licitaciones (
  id                   text primary key default gen_random_uuid()::text,
  proyecto_maestro_id  text,
  codigo_proyecto      text,
  nombre_proyecto      text not null,
  estado               text not null default 'Borrador',
  proveedor_ganador_id text,
  limite_ofertas_ms    bigint,
  datos                jsonb not null default '{}'::jsonb,
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);
create index if not exists licitaciones_creado_idx on public.licitaciones (creado_en desc);
create index if not exists licitaciones_proyecto_idx on public.licitaciones (proyecto_maestro_id);
alter table public.licitaciones enable row level security;

create table if not exists public.licitacion_invitados (
  licitacion_id    text not null references public.licitaciones(id) on delete cascade,
  proveedor_id     text not null,
  proveedor_email  text,
  proveedor_nombre text,
  token_acceso     text,
  estado_propuesta text,
  datos            jsonb not null default '{}'::jsonb,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  primary key (licitacion_id, proveedor_id)
);
create index if not exists lic_invitados_token_idx on public.licitacion_invitados (token_acceso);
alter table public.licitacion_invitados enable row level security;

create or replace function public.es_invitado_licitacion(lic_id text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.licitacion_invitados
    where licitacion_id = lic_id and proveedor_id = public.mi_proveedor_id()
  )
$$;

drop policy if exists licitaciones_lectura on public.licitaciones;
create policy licitaciones_lectura on public.licitaciones
  for select to anon, authenticated
  using (public.es_personal_uct() or public.es_invitado_licitacion(id));

drop policy if exists licitaciones_escritura_uct on public.licitaciones;
create policy licitaciones_escritura_uct on public.licitaciones
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

drop policy if exists lic_invitados_lectura on public.licitacion_invitados;
create policy lic_invitados_lectura on public.licitacion_invitados
  for select to anon, authenticated
  using (public.es_personal_uct() or proveedor_id = public.mi_proveedor_id());

drop policy if exists lic_invitados_escritura on public.licitacion_invitados;
create policy lic_invitados_escritura on public.licitacion_invitados
  for all to anon, authenticated
  using (public.es_personal_uct() or proveedor_id = public.mi_proveedor_id())
  with check (public.es_personal_uct() or proveedor_id = public.mi_proveedor_id());

-- Tokens de invitación (consulta puntual por código secreto)
create table if not exists public.invitaciones_acceso (
  token            text primary key,
  licitacion_id    text not null,
  proveedor_id     text not null,
  proveedor_email  text not null,
  proveedor_nombre text not null,
  creado_en        timestamptz not null default now()
);
alter table public.invitaciones_acceso enable row level security;

drop policy if exists invitaciones_acceso_lectura on public.invitaciones_acceso;
create policy invitaciones_acceso_lectura on public.invitaciones_acceso
  for select to anon, authenticated
  using (public.uid_sesion() <> '' or public.es_personal_uct());

drop policy if exists invitaciones_acceso_escritura on public.invitaciones_acceso;
create policy invitaciones_acceso_escritura on public.invitaciones_acceso
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- Propuestas del portal de proveedores
create table if not exists public.licitacion_propuestas (
  licitacion_id  text not null references public.licitaciones(id) on delete cascade,
  proveedor_id   text not null,
  estado         text,
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (licitacion_id, proveedor_id)
);
alter table public.licitacion_propuestas enable row level security;

drop policy if exists lic_propuestas_acceso on public.licitacion_propuestas;
create policy lic_propuestas_acceso on public.licitacion_propuestas
  for all to anon, authenticated
  using (public.es_personal_uct() or proveedor_id = public.mi_proveedor_id())
  with check (public.es_personal_uct() or proveedor_id = public.mi_proveedor_id());

-- Cotizaciones oficiales
create table if not exists public.cotizaciones (
  id             text primary key,
  licitacion_id  text not null,
  proveedor_id   text not null,
  monto_total    numeric(14, 2) not null default 0,
  fecha_carga    text,
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists cotizaciones_lic_idx on public.cotizaciones (licitacion_id);
create index if not exists cotizaciones_prov_idx on public.cotizaciones (proveedor_id);
alter table public.cotizaciones enable row level security;

drop policy if exists cotizaciones_uct on public.cotizaciones;
create policy cotizaciones_uct on public.cotizaciones
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

-- Consultas, aclaraciones, estados de pago, aumentos de obra, garantías, multas, libro de obra y bitácora
create table if not exists public.licitacion_subcolecciones (
  id             text not null default gen_random_uuid()::text,
  licitacion_id  text not null,
  tipo           text not null check (tipo in (
    'estadosPago', 'aumentosObra', 'garantias', 'multas', 'aclaraciones',
    'consultas', 'consultasPublicadas', 'envios', 'libroObra', 'bitacoraDesarrollo', 'control'
  )),
  proveedor_id   text,
  numero         integer,
  fecha          text,
  estado         text,
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  primary key (licitacion_id, tipo, id)
);
create index if not exists lic_sub_tipo_idx on public.licitacion_subcolecciones (tipo, estado);
alter table public.licitacion_subcolecciones enable row level security;

drop policy if exists lic_sub_lectura on public.licitacion_subcolecciones;
create policy lic_sub_lectura on public.licitacion_subcolecciones
  for select to anon, authenticated
  using (
    public.es_personal_uct()
    or (tipo in ('aclaraciones', 'consultasPublicadas') and public.es_invitado_licitacion(licitacion_id))
    or (tipo = 'consultas' and proveedor_id = public.mi_proveedor_id())
  );

drop policy if exists lic_sub_escritura on public.licitacion_subcolecciones;
create policy lic_sub_escritura on public.licitacion_subcolecciones
  for all to anon, authenticated
  using (
    public.es_personal_uct()
    or (tipo = 'consultas' and proveedor_id = public.mi_proveedor_id() and public.es_invitado_licitacion(licitacion_id))
  )
  with check (
    public.es_personal_uct()
    or (tipo = 'consultas' and proveedor_id = public.mi_proveedor_id() and public.es_invitado_licitacion(licitacion_id))
  );

-- ── 6. Inscripciones de proveedores por invitación ──────────────────────────────────────────────────
create table if not exists public.inscripciones_proveedores (
  codigo         text primary key,
  estado         text not null default 'Invitada',
  datos          jsonb not null default '{}'::jsonb,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.inscripciones_proveedores enable row level security;

drop policy if exists inscripciones_lectura on public.inscripciones_proveedores;
create policy inscripciones_lectura on public.inscripciones_proveedores
  for select to anon, authenticated
  using (true);

drop policy if exists inscripciones_escritura on public.inscripciones_proveedores;
create policy inscripciones_escritura on public.inscripciones_proveedores
  for all to anon, authenticated
  using (public.es_personal_uct() or estado in ('Invitada', 'Observada'))
  with check (public.es_personal_uct() or estado in ('Invitada', 'Observada', 'Enviada'));

-- ── 7. Registro inmutable de auditoría ──────────────────────────────────────────────────────────────
create table if not exists public.auditoria (
  id            uuid primary key default gen_random_uuid(),
  fecha         timestamptz not null default now(),
  usuario       text not null default public.correo_sesion(),
  accion        text not null,
  entidad       text not null,
  entidad_id    text not null,
  nombre        text,
  licitacion_id text,
  cambios       jsonb,
  detalle       text
);
create index if not exists auditoria_fecha_idx on public.auditoria (fecha desc);
alter table public.auditoria enable row level security;

drop policy if exists auditoria_lectura_uct on public.auditoria;
create policy auditoria_lectura_uct on public.auditoria
  for select to anon, authenticated
  using (public.es_personal_uct());

drop policy if exists auditoria_insercion_uct on public.auditoria;
create policy auditoria_insercion_uct on public.auditoria
  for insert to anon, authenticated
  with check (public.es_personal_uct() and usuario = public.correo_sesion());

-- ── 8. Almacenamiento nativo de archivos en Supabase Storage (reemplaza trozos base64 de Firestore) ─
insert into storage.buckets (id, name, public, file_size_limit)
values ('archivos-sistema', 'archivos-sistema', false, 20971520)
on conflict (id) do nothing;

drop policy if exists archivos_sistema_uct on storage.objects;
create policy archivos_sistema_uct on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'archivos-sistema' and (public.es_personal_uct() or public.uid_sesion() <> ''))
  with check (bucket_id = 'archivos-sistema' and (public.es_personal_uct() or public.uid_sesion() <> ''));

