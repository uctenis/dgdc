-- Huella de cada piso (unión de los contornos de sus recintos, con los muros cerrados): base para estimar cubierta
-- (la mayor huella del edificio) y fachadas (perímetro de la huella × altura de piso).
alter table public.pisos add column if not exists huella_m2 numeric;
alter table public.pisos add column if not exists huella_perimetro_m numeric;
