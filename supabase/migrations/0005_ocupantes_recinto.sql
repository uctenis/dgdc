-- Ocupantes de cada recinto según el catastro (hoja UNIFICADO: unidad, cargo y nombre de la persona). No se guardan el
-- RUT ni los datos de contrato. Es una lista porque un recinto puede tener varios ocupantes (una fila por cada uno).
alter table public.recintos
  add column if not exists ocupantes jsonb not null default '[]'::jsonb;   -- [{ "nombre", "cargo", "unidad" }]
