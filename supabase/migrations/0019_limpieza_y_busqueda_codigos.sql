-- 0019: Incluye el código antiguo en la columna generada de búsqueda de recintos
-- para que buscar códigos históricos de planos o catastros anteriores («FAAD-101», «CEC_107», etc.)
-- encuentre el recinto actual inmediatamente.

alter table public.recintos drop column if exists busqueda;
alter table public.recintos add column busqueda text generated always as (
  translate(
    lower(
      codigo || ' ' ||
      nombre || ' ' ||
      coalesce(uso, '') || ' ' ||
      coalesce(unidad_usuaria, '') || ' ' ||
      coalesce(atributos->>'CÓDIGO ANTIGUO', '') || ' ' ||
      coalesce(atributos->>'Código anterior', '') || ' ' ||
      ocupantes::text
    ),
    'áéíóúüñàèìòù',
    'aeiouunaeiou'
  )
) stored;

create index if not exists idx_recintos_busqueda_trgm on public.recintos using gin (busqueda gin_trgm_ops);

