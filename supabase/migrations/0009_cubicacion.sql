-- Cubicación base de los edificios: altura de cada piso y perímetro de cada recinto, para estimar muros (pintura,
-- revestimientos), fachadas y cubiertas. Las cantidades se calculan desde el CAD y se pueden corregir a mano.
alter table public.pisos add column if not exists altura_m numeric;          -- altura de piso a piso (m)
alter table public.pisos add column if not exists altura_origen text;        -- «CAD (cotas de nivel)», «Manual»…
alter table public.recintos add column if not exists perimetro_m numeric;    -- perímetro del contorno del recinto (m)

alter table public.pisos drop constraint if exists pisos_altura_razonable;
alter table public.pisos add constraint pisos_altura_razonable check (altura_m is null or (altura_m > 1.5 and altura_m < 15));
