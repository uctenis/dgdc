-- Vigencia y tenencia de cada recinto, para conocer la infraestructura de cualquier fecha y su evolución:
--   • fecha_alta: desde cuándo existe o opera (vacía = desde antes de que el sistema lo registrara). Si es futura, el
--     recinto está «por venir» (por ejemplo, una obra que se entrega en marzo de 2027) y no suma en los totales de hoy.
--   • fecha_baja: desde cuándo dejó de existir o de estar a cargo de la UCT (demolición, fin de arriendo…).
--   • tenencia: propia, arrendada, en comodato o en concesión.
-- El historial de recintos guarda la fila completa, así que estos datos también quedan en su historia.
alter table public.recintos
  add column if not exists fecha_alta  date,
  add column if not exists motivo_alta text,
  add column if not exists fecha_baja  date,
  add column if not exists motivo_baja text,
  add column if not exists tenencia    text not null default 'Propia';

alter table public.recintos drop constraint if exists recintos_tenencia_valida;
alter table public.recintos add constraint recintos_tenencia_valida
  check (tenencia in ('Propia', 'Arrendada', 'Comodato', 'Concesión'));

alter table public.recintos drop constraint if exists recintos_vigencia_ordenada;
alter table public.recintos add constraint recintos_vigencia_ordenada
  check (fecha_alta is null or fecha_baja is null or fecha_baja >= fecha_alta);
