-- 0016: planta vectorial por capas de cada lámina (prueba con CSF16 L03, 2026-11-10).
-- La genera dgdc-datos/…/scripts/planta_vectorial.py desde el DXF del edificio, con el mismo calce que los contornos:
-- queda en coordenadas de la lámina y calza exacta con ellos. Se muestra en el visor en vez del PDF (no se pixela, se
-- pueden prender y apagar capas); el PDF sigue siendo la lámina oficial para descargar e imprimir.
create table if not exists public.laminas_vectoriales (
  documento_id uuid primary key references public.documentos(id) on delete cascade,
  datos        jsonb not null,           -- { version, W, H, capas: [{id, nombre, d, relleno?}], textos: [...] }
  generado_en  timestamptz not null default now()
);
alter table public.laminas_vectoriales enable row level security;
drop policy if exists laminas_vectoriales_uct on public.laminas_vectoriales;
create policy laminas_vectoriales_uct on public.laminas_vectoriales
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());
