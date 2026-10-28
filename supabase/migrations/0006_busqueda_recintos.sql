-- Texto para buscar recintos por código, nombre, uso, unidad y ocupantes (nombre, cargo y unidad de cada persona), en
-- minúsculas y sin tildes. Lo mantiene la base sola: se recalcula cada vez que cambia el recinto.
alter table public.recintos add column if not exists busqueda text generated always as (
  translate(lower(codigo || ' ' || nombre || ' ' || coalesce(uso, '') || ' ' || coalesce(unidad_usuaria, '') || ' ' || ocupantes::text),
            'áéíóúüñàèìòù', 'aeiouunaeiou')) stored;
