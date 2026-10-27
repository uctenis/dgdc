-- Visor de planos: cada lámina puede tener una copia en PDF para mostrarla en el sistema (el original sigue en Drive)
-- y, sobre ella, el contorno de cada recinto. Las coordenadas del contorno van de 0 a 1 respecto del ancho y el alto
-- de la página, así no dependen de la resolución con que se muestre.

alter table public.documentos
  add column archivo_visor text,   -- ruta de la copia en el almacenamiento "laminas" ({edificio}/{documento}.pdf)
  add column escala text;          -- escala de la lámina impresa ("1:65"), para medir superficies sobre el plano

create table public.zonas_recinto (
  id             uuid primary key default gen_random_uuid(),
  documento_id   uuid not null references public.documentos (id) on delete cascade,
  recinto_id     uuid not null references public.recintos (id) on delete cascade,
  pagina         integer not null default 1,
  poligono       jsonb not null,    -- [[x, y], …] entre 0 y 1
  creado_en      timestamptz not null default now(),
  creado_por     text not null default public.correo_sesion(),
  modificado_en  timestamptz not null default now(),
  modificado_por text not null default public.correo_sesion(),
  unique (documento_id, recinto_id)
);
create index zonas_recinto_documento on public.zonas_recinto (documento_id);

create trigger zonas_recinto_modificacion before update on public.zonas_recinto for each row execute function public.marcar_modificacion();
alter table public.zonas_recinto enable row level security;
create policy zonas_recinto_personal on public.zonas_recinto for all to anon, authenticated
  using (public.es_personal_uct()) with check (public.es_personal_uct());

-- Almacenamiento privado de las láminas: solo personal UCT puede verlas, subirlas o reemplazarlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('laminas', 'laminas', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create policy laminas_personal on storage.objects for all to anon, authenticated
  using (bucket_id = 'laminas' and public.es_personal_uct())
  with check (bucket_id = 'laminas' and public.es_personal_uct());
