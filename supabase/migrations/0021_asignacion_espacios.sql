-- 0021: módulo de Asignación de Espacios. Ubicar a los funcionarios sin recinto, plantear cambios (propuestas con su
-- antes y después) y llevar el historial de cada movimiento de personas entre recintos.
-- Un movimiento lleva a una persona de un recinto a otro (desde vacío = se ubica por primera vez; hacia vacío = deja
-- su recinto). Los movimientos sueltos se aplican al tiro; los de una propuesta, todos juntos al aplicarla.

create table if not exists public.asignacion_propuestas (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  descripcion   text,
  estado        text not null default 'Borrador' check (estado in ('Borrador', 'Aplicada', 'Descartada')),
  -- Antes y después de cada recinto afectado, guardado al aplicar (después ya no se puede reconstruir).
  resumen       jsonb,
  creado_por    text,
  creado_en     timestamptz not null default now(),
  aplicado_por  text,
  aplicado_en   timestamptz
);

create table if not exists public.asignacion_movimientos (
  id               uuid primary key default gen_random_uuid(),
  propuesta_id     uuid references public.asignacion_propuestas(id) on delete cascade,
  persona          jsonb not null,           -- { nombre, cargo, unidad }
  desde_id         uuid references public.recintos(id) on delete set null,
  desde_codigo     text,
  hacia_id         uuid references public.recintos(id) on delete set null,
  hacia_codigo     text,
  conservar_origen boolean not null default false,   -- segunda oficina: se agrega al destino sin quitarla del origen
  estado           text not null default 'Propuesto' check (estado in ('Propuesto', 'Aplicado')),
  orden            integer not null default 0,
  realizado_por    text,
  realizado_en     timestamptz,
  creado_en        timestamptz not null default now(),
  check (desde_id is not null or hacia_id is not null)
);
create index if not exists asignacion_movimientos_propuesta on public.asignacion_movimientos (propuesta_id, orden);
create index if not exists asignacion_movimientos_fecha on public.asignacion_movimientos (realizado_en desc) where estado = 'Aplicado';

alter table public.asignacion_propuestas enable row level security;
alter table public.asignacion_movimientos enable row level security;
drop policy if exists asignacion_propuestas_uct on public.asignacion_propuestas;
create policy asignacion_propuestas_uct on public.asignacion_propuestas for all to anon, authenticated
  using (public.es_personal_uct()) with check (public.es_personal_uct());
drop policy if exists asignacion_movimientos_uct on public.asignacion_movimientos;
create policy asignacion_movimientos_uct on public.asignacion_movimientos for all to anon, authenticated
  using (public.es_personal_uct()) with check (public.es_personal_uct());
grant select, insert, update, delete on public.asignacion_propuestas, public.asignacion_movimientos to anon, authenticated;

-- Misma clave de persona que el sistema (utils/analisisEspacios.ts → clavePersona): palabras sin tildes, en
-- mayúsculas y ordenadas, para reconocer «Pérez Soto, Ana» y «ANA PEREZ SOTO» como la misma persona.
create or replace function public.clave_persona(nombre text) returns text
language sql immutable as $$
  select coalesce(string_agg(p, ' ' order by p), '')
  from regexp_split_to_table(upper(translate(coalesce(nombre, ''), 'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ.,;()', 'aeiouunAEIOUUNaeiouAEIOU     ')), '\s+') as p
  where p <> ''
$$;

-- Aplica movimientos propuestos, en orden y todos o ninguno: quita a la persona del origen (salvo conservar_origen)
-- y la agrega al destino (sin duplicarla). Cada cambio queda además en el historial del recinto (trigger de 0001).
create or replace function public.aplicar_movimientos(p_ids uuid[], p_usuario text) returns integer
language plpgsql security invoker as $$
declare
  m record;
  n integer := 0;
begin
  if not public.es_personal_uct() then raise exception 'Sin permiso'; end if;
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
grant execute on function public.aplicar_movimientos(uuid[], text) to anon, authenticated;
grant execute on function public.clave_persona(text) to anon, authenticated;
