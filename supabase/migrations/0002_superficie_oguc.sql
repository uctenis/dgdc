-- El catastro de la UCT registra dos superficies por recinto: la interior útil y la según OGUC (Ordenanza General
-- de Urbanismo y Construcciones, que incluye muros). superficie_m2 es la interior útil; esta columna, la OGUC.
alter table public.recintos
  add column superficie_oguc_m2 numeric(10, 2) check (superficie_oguc_m2 is null or superficie_oguc_m2 >= 0);
