-- 0018: superficie construida de cada campus (para ordenar los campus en todo el sistema: Menchaca Lira primero por
-- ser la Rectoría y luego de mayor a menor superficie). Cuenta los recintos vigentes; la superficie construida es la
-- OGUC y, si un recinto no la tiene, la útil. Corre con los permisos de quien la llama (reglas de recintos).
create or replace function public.superficie_por_campus()
returns table (campus text, m2 numeric)
language sql stable security invoker set search_path = public as $$
  select left(edificio_codigo, 3), round(sum(coalesce(superficie_oguc_m2, superficie_m2)))
    from public.recintos
   where estado <> 'Eliminado' and (fecha_baja is null or fecha_baja > current_date)
   group by 1
$$;
grant execute on function public.superficie_por_campus() to anon, authenticated, lector_claude;
