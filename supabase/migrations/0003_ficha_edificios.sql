-- Ficha de cada edificio (o inmueble) según el catastro: datos que no son de un recinto en particular. Las superficies
-- son las que informa el catastro para el edificio completo; si faltan, la pantalla muestra la suma de sus recintos.
create table public.edificios (
  codigo              text primary key,                -- "CSF12", "CSN11"
  campus_nombre       text,
  nombre              text,
  nombre_anterior     text,                            -- abreviatura antigua ("MLA")
  categoria           text,
  uso_principal       text,
  direccion           text,
  rol                 text,                            -- rol de avalúo
  superficie_terreno_m2 numeric(12, 2) check (superficie_terreno_m2 is null or superficie_terreno_m2 >= 0),
  superficie_m2       numeric(12, 2) check (superficie_m2 is null or superficie_m2 >= 0),            -- interior útil
  superficie_oguc_m2  numeric(12, 2) check (superficie_oguc_m2 is null or superficie_oguc_m2 >= 0),
  anio_construccion   integer,
  anio_ascensor       text,
  rampa               text,
  regularizacion      jsonb not null default '{}'::jsonb,  -- permisos de edificación, recepciones y sus fechas
  comentarios         text,
  atributos           jsonb not null default '{}'::jsonb,  -- resto de columnas del catastro (m² por año, áreas verdes…)
  creado_en           timestamptz not null default now(),
  creado_por          text not null default public.correo_sesion(),
  modificado_en       timestamptz not null default now(),
  modificado_por      text not null default public.correo_sesion()
);

create trigger edificios_modificacion before update on public.edificios for each row execute function public.marcar_modificacion();
alter table public.edificios enable row level security;
create policy edificios_personal on public.edificios for all to anon, authenticated
  using (public.es_personal_uct()) with check (public.es_personal_uct());
