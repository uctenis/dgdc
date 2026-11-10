-- 0017: ubicación de cada edificio sobre la ilustración (plano general) del campus, para abrirlo con un clic.
-- x, y van de 0 a 1 sobre la imagen. Se ajustan desde el sistema («Ubicar edificios»); CJP viene ya ubicado
-- (marcadores detectados en CJP.jpg, 3600 × 2700, 2026-11-10).
create table if not exists public.campus_marcadores (
  sigla          text primary key,
  marcadores     jsonb not null default '[]'::jsonb,   -- [{ "edificio": "CJP01", "x": 0.1877, "y": 0.8558 }, …]
  actualizado_en timestamptz not null default now()
);
alter table public.campus_marcadores enable row level security;
drop policy if exists campus_marcadores_uct on public.campus_marcadores;
create policy campus_marcadores_uct on public.campus_marcadores
  for all to anon, authenticated
  using (public.es_personal_uct())
  with check (public.es_personal_uct());

insert into public.campus_marcadores (sigla, marcadores) values ('CJP', '[
  {"edificio":"CJP01","x":0.1877,"y":0.8558}, {"edificio":"CJP02","x":0.2343,"y":0.8329},
  {"edificio":"CJP03","x":0.2995,"y":0.8165}, {"edificio":"CJP04","x":0.2744,"y":0.7481},
  {"edificio":"CJP05","x":0.3522,"y":0.7534}, {"edificio":"CJP06","x":0.1420,"y":0.7710},
  {"edificio":"CJP07","x":0.2203,"y":0.7004}, {"edificio":"CJP08","x":0.3435,"y":0.5546},
  {"edificio":"CJP09","x":0.4167,"y":0.5547}, {"edificio":"CJP10","x":0.4337,"y":0.4636},
  {"edificio":"CJP11","x":0.5084,"y":0.3688}, {"edificio":"CJP12","x":0.5793,"y":0.3459},
  {"edificio":"CJP13","x":0.6030,"y":0.2968}, {"edificio":"CJP14","x":0.5052,"y":0.5222},
  {"edificio":"CJP15","x":0.3546,"y":0.7117}, {"edificio":"CJP16","x":0.7146,"y":0.5222},
  {"edificio":"CJP17","x":0.5621,"y":0.4867}
]'::jsonb)
on conflict (sigla) do update set marcadores = excluded.marcadores, actualizado_en = now();
