-- ════════════════════════════════════════════════════════════════════════════════════════════════════
-- Módulo de control documental: pisos y recintos de cada edificio, y el índice de planos y documentos.
--
-- Jerarquía: Campus > Edificio > Piso > Recinto. Campus y edificios siguen por ahora en la configuración
-- compartida de Firebase (Configuración → Sedes & Campus); aquí se referencian por su código ("CSF12", y las
-- zonas exteriores "CSF-CE"). Cuando el resto del sistema pase a Postgres, se agregan sus tablas y las llaves.
--
-- Los archivos de los planos NO se guardan aquí: siguen en las carpetas de Drive de la Dirección. Esta base
-- guarda el índice (qué es cada plano, de qué edificio y especialidad, su versión y si está vigente).
--
-- Acceso: solo personal UCT. La sesión es la de Firebase del sitio (Supabase la acepta como autenticación de
-- terceros); las políticas exigen un correo @uct.cl verificado en esa sesión.
-- ════════════════════════════════════════════════════════════════════════════════════════════════════

-- ── Quién puede leer y escribir ─────────────────────────────────────────────────────────────────────
create or replace function public.es_personal_uct() returns boolean
language sql stable as $$
  select coalesce((auth.jwt() ->> 'email_verified')::boolean, false)
     and lower(coalesce(auth.jwt() ->> 'email', '')) like '%@uct.cl'
$$;

create or replace function public.correo_sesion() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

-- Fecha de modificación y autor automáticos.
create or replace function public.marcar_modificacion() returns trigger
language plpgsql as $$
begin
  new.modificado_en := now();
  new.modificado_por := public.correo_sesion();
  return new;
end $$;

-- ── Pisos ───────────────────────────────────────────────────────────────────────────────────────────
create table public.pisos (
  id              uuid primary key default gen_random_uuid(),
  edificio_codigo text not null,                       -- "CSF12"
  codigo          text not null,                       -- "S1", "P1", "P2", "ENT" (entretecho)…
  nombre          text not null,                       -- "Primer piso", "Subterráneo"…
  orden           integer not null default 0,          -- para listarlos de abajo hacia arriba
  observaciones   text,
  creado_en       timestamptz not null default now(),
  creado_por      text not null default public.correo_sesion(),
  modificado_en   timestamptz not null default now(),
  modificado_por  text not null default public.correo_sesion(),
  unique (edificio_codigo, codigo)
);
create index pisos_edificio on public.pisos (edificio_codigo, orden);

-- ── Recintos ────────────────────────────────────────────────────────────────────────────────────────
create table public.recintos (
  id              uuid primary key default gen_random_uuid(),
  edificio_codigo text not null,
  piso_id         uuid not null references public.pisos (id) on delete restrict,
  codigo          text not null,                       -- "A102", único dentro del edificio
  nombre          text not null,                       -- "Sala de clases"
  uso             text,                                -- docencia, laboratorio, oficina, servicios higiénicos…
  superficie_m2   numeric(10, 2) check (superficie_m2 is null or superficie_m2 >= 0),
  capacidad       integer check (capacidad is null or capacidad >= 0),
  estado          text not null default 'Operativo'
                  check (estado in ('Operativo', 'En obra', 'Fuera de servicio', 'Eliminado')),
  unidad_usuaria  text,                                -- facultad o unidad que lo ocupa
  foto_url        text,                                -- enlace a la foto de referencia (Drive)
  observaciones   text,
  -- Columnas propias de cada planilla que no calzan en las de arriba (se conservan sin perderlas).
  atributos       jsonb not null default '{}'::jsonb,
  -- De dónde salió el dato: planilla importada, plano o ingreso a mano.
  origen          text not null default 'Manual' check (origen in ('Planilla', 'Plano', 'Manual')),
  creado_en       timestamptz not null default now(),
  creado_por      text not null default public.correo_sesion(),
  modificado_en   timestamptz not null default now(),
  modificado_por  text not null default public.correo_sesion(),
  unique (edificio_codigo, codigo)
);
create index recintos_piso on public.recintos (piso_id);
create index recintos_edificio on public.recintos (edificio_codigo);

-- ── Documentos y planos (índice; el archivo vive en Drive) ──────────────────────────────────────────
create table public.documentos (
  id              uuid primary key default gen_random_uuid(),
  edificio_codigo text not null,
  piso_id         uuid references public.pisos (id) on delete set null,  -- vacío = todo el edificio
  titulo          text not null,                       -- "Planta arquitectura 1er piso"
  tipo            text not null default 'Plano'
                  check (tipo in ('Plano', 'Especificación técnica', 'Memoria de cálculo', 'Informe', 'Certificado', 'Otro')),
  especialidad    text not null default 'Arquitectura'
                  check (especialidad in ('Arquitectura', 'Estructuras', 'Eléctrica', 'Sanitaria', 'Climatización',
                                          'Gas', 'Corrientes débiles', 'Red contra incendio', 'Paisajismo', 'Topografía', 'Otra')),
  formato         text check (formato in ('DWG', 'PDF', 'Otro')),
  codigo_lamina   text,                                -- "A-02"
  version         text not null default '1',          -- "1", "2", "B"…
  fecha_documento date,                                -- fecha del plano (no la de carga)
  vigente         boolean not null default true,       -- solo la última versión de cada lámina queda vigente
  reemplaza_a     uuid references public.documentos (id) on delete set null,
  drive_url       text not null,
  proyecto_codigo text,                                -- proyecto que lo generó, si corresponde ("2026_017")
  observaciones   text,
  creado_en       timestamptz not null default now(),
  creado_por      text not null default public.correo_sesion(),
  modificado_en   timestamptz not null default now(),
  modificado_por  text not null default public.correo_sesion()
);
create index documentos_edificio on public.documentos (edificio_codigo, especialidad, vigente);

-- Al registrar una nueva versión, la que reemplaza deja de estar vigente.
create or replace function public.retirar_version_anterior() returns trigger
language plpgsql as $$
begin
  if new.reemplaza_a is not null and new.vigente then
    update public.documentos set vigente = false where id = new.reemplaza_a;
  end if;
  return new;
end $$;
create trigger documentos_nueva_version after insert on public.documentos
  for each row execute function public.retirar_version_anterior();

-- ── Historial de cambios de recintos (superficie, uso, estado…), para saber qué cambió y cuándo ─────
create table public.historial_recintos (
  id          bigint generated always as identity primary key,
  recinto_id  uuid not null,
  accion      text not null check (accion in ('Creó', 'Modificó', 'Eliminó')),
  antes       jsonb,
  despues     jsonb,
  fecha       timestamptz not null default now(),
  usuario     text not null default public.correo_sesion()
);
create index historial_recintos_recinto on public.historial_recintos (recinto_id, fecha desc);

create or replace function public.registrar_historial_recinto() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into historial_recintos (recinto_id, accion, despues) values (new.id, 'Creó', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into historial_recintos (recinto_id, accion, antes, despues) values (new.id, 'Modificó', to_jsonb(old), to_jsonb(new));
  else
    insert into historial_recintos (recinto_id, accion, antes) values (old.id, 'Eliminó', to_jsonb(old));
  end if;
  return null;
end $$;
create trigger recintos_historial after insert or update or delete on public.recintos
  for each row execute function public.registrar_historial_recinto();

create trigger pisos_modificacion before update on public.pisos for each row execute function public.marcar_modificacion();
create trigger recintos_modificacion before update on public.recintos for each row execute function public.marcar_modificacion();
create trigger documentos_modificacion before update on public.documentos for each row execute function public.marcar_modificacion();

-- ── Seguridad por fila: solo personal UCT ───────────────────────────────────────────────────────────
alter table public.pisos enable row level security;
alter table public.recintos enable row level security;
alter table public.documentos enable row level security;
alter table public.historial_recintos enable row level security;

-- Las políticas aplican a anon y authenticated: la sesión de Firebase llega verificada por Supabase y la
-- condición real es el correo @uct.cl verificado (sin sesión, auth.jwt() viene vacío y no pasa).
create policy pisos_personal on public.pisos for all to anon, authenticated
  using (public.es_personal_uct()) with check (public.es_personal_uct());
create policy recintos_personal on public.recintos for all to anon, authenticated
  using (public.es_personal_uct()) with check (public.es_personal_uct());
create policy documentos_personal on public.documentos for all to anon, authenticated
  using (public.es_personal_uct()) with check (public.es_personal_uct());
-- El historial solo se lee; lo escribe el disparador.
create policy historial_lectura on public.historial_recintos for select to anon, authenticated
  using (public.es_personal_uct());
