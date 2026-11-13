-- 0025: control de cambios en Asignación de Espacios. Una propuesta pasa por
--   Borrador → En revisión → Aprobada → Aplicada   (o se devuelve a Borrador con observaciones, o se descarta)
-- y cada paso queda en una bitácora (quién, cuándo, comentario). Solo se edita en Borrador, solo el administrador
-- del sistema aprueba, y solo una propuesta aprobada se aplica a los recintos. Al aprobar se guarda la foto del
-- antes y después aprobados, para avisar si los recintos cambiaron antes de aplicarla.

alter table public.asignacion_propuestas drop constraint if exists asignacion_propuestas_estado_check;
alter table public.asignacion_propuestas add constraint asignacion_propuestas_estado_check
  check (estado in ('Borrador', 'En revisión', 'Aprobada', 'Aplicada', 'Descartada'));
alter table public.asignacion_propuestas add column if not exists enviado_por text;
alter table public.asignacion_propuestas add column if not exists enviado_en timestamptz;
alter table public.asignacion_propuestas add column if not exists aprobado_por text;
alter table public.asignacion_propuestas add column if not exists aprobado_en timestamptz;
alter table public.asignacion_propuestas add column if not exists resumen_aprobado jsonb;
-- Comentario del último cambio de estado (se copia a la bitácora).
alter table public.asignacion_propuestas add column if not exists observaciones text;

create table if not exists public.asignacion_propuesta_eventos (
  id              uuid primary key default gen_random_uuid(),
  propuesta_id    uuid not null references public.asignacion_propuestas(id) on delete cascade,
  estado_anterior text,
  estado_nuevo    text not null,
  comentario      text,
  por             text,
  en              timestamptz not null default now()
);
create index if not exists asignacion_eventos_propuesta on public.asignacion_propuesta_eventos (propuesta_id, en);
alter table public.asignacion_propuesta_eventos enable row level security;
drop policy if exists asignacion_eventos_uct on public.asignacion_propuesta_eventos;
create policy asignacion_eventos_uct on public.asignacion_propuesta_eventos for select to anon, authenticated
  using (public.es_personal_uct());
grant select on public.asignacion_propuesta_eventos to anon, authenticated;

-- Transiciones permitidas, sellos de quién y cuándo, y bitácora.
-- Corre con los permisos de quien llama: así distingue las consultas del sitio (roles anon y authenticated).
create or replace function public.validar_estado_propuesta() returns trigger
language plpgsql security invoker set search_path = public as $$
declare v_paso text;
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'Borrador' then raise exception 'Una propuesta nueva empieza en Borrador'; end if;
    return new;
  end if;
  if new.estado = old.estado then
    -- Sin cambio de estado: nombre y descripción solo se cambian en Borrador.
    if old.estado <> 'Borrador' and (new.nombre is distinct from old.nombre or new.descripcion is distinct from old.descripcion) then
      raise exception 'La propuesta solo se edita en Borrador';
    end if;
    return new;
  end if;
  v_paso := old.estado || ' → ' || new.estado;
  if v_paso not in ('Borrador → En revisión', 'Borrador → Descartada', 'En revisión → Borrador', 'En revisión → Aprobada',
                    'En revisión → Descartada', 'Aprobada → Borrador', 'Aprobada → Aplicada', 'Descartada → Borrador') then
    raise exception 'Cambio de estado no permitido: %', v_paso;
  end if;
  if new.estado = 'Aprobada' and current_user in ('anon', 'authenticated') and not public.es_admin_sistema() then
    raise exception 'Solo el administrador del sistema aprueba propuestas';
  end if;
  if v_paso = 'En revisión → Borrador' and coalesce(trim(new.observaciones), '') = '' then
    raise exception 'Al devolver una propuesta indique qué debe corregirse';
  end if;
  if new.estado = 'En revisión' then new.enviado_por := public.correo_sesion(); new.enviado_en := now(); end if;
  if new.estado = 'Aprobada' then new.aprobado_por := public.correo_sesion(); new.aprobado_en := now(); end if;
  if new.estado = 'Borrador' then new.aprobado_por := null; new.aprobado_en := null; new.resumen_aprobado := null; end if;
  return new;
end $$;
drop trigger if exists validar_estado on public.asignacion_propuestas;
create trigger validar_estado before insert or update on public.asignacion_propuestas
  for each row execute function public.validar_estado_propuesta();

-- Bitácora: después de guardar (la propuesta ya existe).
create or replace function public.registrar_evento_propuesta() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.asignacion_propuesta_eventos (propuesta_id, estado_anterior, estado_nuevo, comentario, por)
    values (new.id, null, new.estado, 'Propuesta creada', coalesce(nullif(public.correo_sesion(), ''), new.creado_por));
  elsif new.estado is distinct from old.estado then
    insert into public.asignacion_propuesta_eventos (propuesta_id, estado_anterior, estado_nuevo, comentario, por)
    values (new.id, old.estado, new.estado, nullif(trim(coalesce(new.observaciones, '')), ''), nullif(public.correo_sesion(), ''));
  end if;
  return null;
end $$;
drop trigger if exists registrar_evento on public.asignacion_propuestas;
create trigger registrar_evento after insert or update on public.asignacion_propuestas
  for each row execute function public.registrar_evento_propuesta();

-- Los cambios de una propuesta solo se agregan o quitan mientras está en Borrador.
create or replace function public.validar_movimiento_propuesta() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_estado text; v_prop uuid := case when tg_op = 'DELETE' then old.propuesta_id else new.propuesta_id end;
begin
  if v_prop is null then return coalesce(new, old); end if;
  select estado into v_estado from public.asignacion_propuestas where id = v_prop;
  -- Al borrar la propuesta completa (cascada) ya no existe: se permite.
  if v_estado is not null and v_estado <> 'Borrador' then
    raise exception 'Los cambios solo se modifican con la propuesta en Borrador (está %)', v_estado;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists validar_borrador on public.asignacion_movimientos;
create trigger validar_borrador before insert or delete on public.asignacion_movimientos
  for each row execute function public.validar_movimiento_propuesta();

-- Una propuesta solo se aplica si está aprobada (los movimientos sueltos, sin propuesta, se aplican al tiro).
create or replace function public.aplicar_movimientos(p_ids uuid[], p_usuario text) returns integer
language plpgsql security invoker as $$
declare
  m record;
  n integer := 0;
begin
  if not public.es_personal_uct() then raise exception 'Sin permiso'; end if;
  if exists (select 1 from public.asignacion_movimientos am join public.asignacion_propuestas p on p.id = am.propuesta_id
             where am.id = any(p_ids) and p.estado <> 'Aprobada') then
    raise exception 'La propuesta debe estar aprobada para aplicarla';
  end if;
  for m in select * from public.asignacion_movimientos where id = any(p_ids) and estado = 'Propuesto' order by orden, creado_en loop
    if m.desde_id is not null and not m.conservar_origen then
      update public.recintos r set ocupantes = coalesce((
        select jsonb_agg(o order by i) from jsonb_array_elements(r.ocupantes) with ordinality e(o, i)
        where public.clave_persona(o->>'nombre') <> public.clave_persona(m.persona->>'nombre')), '[]'::jsonb)
      where r.id = m.desde_id;
    end if;
    if m.hacia_id is not null then
      update public.recintos r set ocupantes = r.ocupantes || jsonb_build_array(m.persona)
      where r.id = m.hacia_id
        and not exists (select 1 from jsonb_array_elements(r.ocupantes) o
                        where public.clave_persona(o->>'nombre') = public.clave_persona(m.persona->>'nombre'));
    end if;
    update public.asignacion_movimientos set estado = 'Aplicado', realizado_por = p_usuario, realizado_en = now() where id = m.id;
    n := n + 1;
  end loop;
  return n;
end $$;
