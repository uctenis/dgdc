-- 0015: etapa 2 de la unificación — Supabase pasa a ser la FUENTE de proyectos, licitaciones (y todo lo que cuelga de
-- ellas), proveedores, cotizaciones, inscripciones e invitaciones.
--
-- El sistema guarda cada registro como un documento (columna «datos», jsonb) igual que en Firestore, y la capa
-- src/lib/almacen.ts ofrece las mismas operaciones (leer, escribir, transacciones, lotes, avisos en vivo). Aquí:
--   1. Triggers que mantienen las columnas de cada tabla (estado, RUT, código…) a partir del documento, y la versión
--      (actualizado_en) que usan las transacciones.
--   2. aplicar_cambios: actualiza un documento con la semántica de Firestore (campos con punto = ruta; increment,
--      arrayUnion, arrayRemove, deleteField y serverTimestamp).
--   3. escribir_documentos: aplica varias escrituras en UNA transacción de la base; si una escritura trae la versión
--      que se leyó y el registro cambió entremedio, falla con CONFLICTO_TRANSACCION y el sistema reintenta (igual
--      que las transacciones de Firestore). Corre con los permisos de quien llama: las reglas (RLS) se aplican igual.
--   4. Normaliza las fechas copiadas de Firestore ({seconds, nanoseconds} → texto ISO).

-- ── Columnas que faltaban para guardar documentos completos ──
alter table public.invitaciones_acceso add column if not exists datos jsonb not null default '{}'::jsonb;
alter table public.invitaciones_acceso add column if not exists actualizado_en timestamptz not null default now();
update public.invitaciones_acceso set datos = jsonb_build_object(
  'licitacionId', licitacion_id, 'proveedorId', proveedor_id, 'proveedorEmail', proveedor_email, 'proveedorNombre', proveedor_nombre)
where datos = '{}'::jsonb;
alter table public.historial_obras_proveedor add column if not exists actualizado_en timestamptz not null default now();

-- ── Conversión segura de texto a número (un valor raro no debe impedir guardar) ──
create or replace function public.a_numero(t text) returns numeric
language plpgsql immutable as $$
begin
  return nullif(t, '')::numeric;
exception when others then
  return null;
end $$;

-- ── 1. Columnas derivadas del documento y versión ──
create or replace function public.derivar_columnas() returns trigger
language plpgsql as $$
declare d jsonb := coalesce(new.datos, '{}'::jsonb);
begin
  new.actualizado_en := clock_timestamp();
  case tg_table_name
    when 'proyectos' then
      new.correlativo := coalesce(public.a_numero(d->>'correlativo')::int, new.correlativo, 1);
      new.codigo_proyecto := coalesce(nullif(d->>'codigoProyecto', ''), new.codigo_proyecto, new.id);
      new.nombre := coalesce(d->>'nombre', '');
      new.anio_presupuesto := public.a_numero(d->>'anioPresupuesto')::int;
      new.campus_sigla := nullif(d->>'campusSigla', '');
      new.edificio_sigla := nullif(d->>'edificioSigla', '');
      new.estado := nullif(d->>'estado', '');
      new.gasto_efectivo := coalesce(public.a_numero(d->>'gastoEfectivo'), 0);
    when 'licitaciones' then
      new.proyecto_maestro_id := nullif(d->>'proyectoMaestroId', '');
      new.codigo_proyecto := nullif(d->>'codigoProyecto', '');
      new.nombre_proyecto := coalesce(d->>'nombreProyecto', '');
      new.estado := coalesce(nullif(d->>'estado', ''), 'Borrador');
      new.proveedor_ganador_id := coalesce(nullif(d->>'proveedorAdjudicadoId', ''), nullif(d->>'proveedorGanadorId', ''));
      new.limite_ofertas_ms := public.a_numero(d->>'limiteOfertasMs')::bigint;
    when 'licitacion_invitados' then
      new.proveedor_email := nullif(d->>'proveedorEmail', '');
      new.proveedor_nombre := nullif(d->>'proveedorNombre', '');
      new.token_acceso := nullif(d->>'tokenAcceso', '');
      new.estado_propuesta := nullif(d->>'estadoPropuesta', '');
    when 'licitacion_propuestas' then
      new.estado := nullif(d->>'estado', '');
    when 'licitacion_subcolecciones' then
      new.proveedor_id := nullif(d->>'proveedorId', '');
      new.numero := public.a_numero(d->>'numero')::int;
      new.fecha := coalesce(nullif(d->>'fecha', ''), nullif(d->>'fechaPregunta', ''));
      new.estado := nullif(d->>'estado', '');
    when 'proyecto_subcolecciones' then
      new.fecha := nullif(d->>'fecha', '');
      new.estado := nullif(d->>'estado', '');
    when 'proveedores' then
      new.rut := coalesce(d->>'rut', '');
      new.razon_social := coalesce(d->>'razonSocial', '');
      new.email := nullif(d->>'email', '');
      new.estado := coalesce(nullif(d->>'estado', ''), 'Activo');
    when 'evaluaciones_desempeno' then
      new.licitacion_id := nullif(d->>'licitacionId', '');
      new.fecha := coalesce(d->>'fecha', '');
      new.puntaje_final := public.a_numero(d->>'puntajeFinal');
    when 'historial_obras_proveedor' then
      new.licitacion_id := coalesce(nullif(d->>'licitacionId', ''), new.licitacion_id, new.id);
      new.fecha := nullif(d->>'fecha', '');
    when 'cotizaciones' then
      new.licitacion_id := coalesce(d->>'licitacionId', '');
      new.proveedor_id := coalesce(d->>'proveedorId', '');
      new.monto_total := coalesce(public.a_numero(d->>'montoTotal'), 0);
      new.fecha_carga := nullif(d->>'fechaCarga', '');
    when 'inscripciones_proveedores' then
      new.estado := coalesce(nullif(d->>'estado', ''), 'Invitada');
    when 'invitaciones_acceso' then
      new.licitacion_id := coalesce(nullif(d->>'licitacionId', ''), new.licitacion_id, '');
      new.proveedor_id := coalesce(nullif(d->>'proveedorId', ''), new.proveedor_id, '');
      new.proveedor_email := coalesce(d->>'proveedorEmail', new.proveedor_email, '');
      new.proveedor_nombre := coalesce(d->>'proveedorNombre', new.proveedor_nombre, '');
    else
      null;  -- contadores: solo la versión
  end case;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['proyectos', 'proyecto_subcolecciones', 'contadores', 'licitaciones', 'licitacion_invitados',
    'licitacion_propuestas', 'licitacion_subcolecciones', 'proveedores', 'evaluaciones_desempeno', 'historial_obras_proveedor',
    'cotizaciones', 'inscripciones_proveedores', 'invitaciones_acceso'] loop
    execute format('drop trigger if exists derivar_columnas on public.%I', t);
    execute format('create trigger derivar_columnas before insert or update on public.%I for each row execute function public.derivar_columnas()', t);
  end loop;
end $$;

-- ── 2. Cambios con la semántica de Firestore ──
-- Pone un valor en una ruta (a.b.c), creando los niveles intermedios que falten.
create or replace function public.jsonb_poner_ruta(doc jsonb, ruta text[], valor jsonb) returns jsonb
language plpgsql immutable as $$
declare base jsonb := case when jsonb_typeof(doc) = 'object' then doc else '{}'::jsonb end;
begin
  if coalesce(array_length(ruta, 1), 0) <= 1 then
    return base || jsonb_build_object(ruta[1], valor);
  end if;
  return base || jsonb_build_object(ruta[1], public.jsonb_poner_ruta(base -> ruta[1], ruta[2:], valor));
end $$;

-- Aplica `cambios` (claves con punto = ruta) sobre `doc`. Valores especiales: {"__op":"increment","n":1},
-- {"__op":"arrayUnion","v":[…]}, {"__op":"arrayRemove","v":[…]}, {"__op":"deleteField"}, {"__op":"serverTimestamp"}.
create or replace function public.aplicar_cambios(doc jsonb, cambios jsonb) returns jsonb
language plpgsql volatile as $$
declare
  k text; v jsonb; ruta text[]; actual jsonb; op text; lista jsonb;
begin
  doc := case when jsonb_typeof(doc) = 'object' then doc else '{}'::jsonb end;
  for k, v in select * from jsonb_each(coalesce(cambios, '{}'::jsonb)) loop
    ruta := string_to_array(k, '.');
    op := case when jsonb_typeof(v) = 'object' then v->>'__op' end;
    if op = 'deleteField' then
      doc := doc #- ruta;
      continue;
    end if;
    actual := doc #> ruta;
    lista := case when jsonb_typeof(actual) = 'array' then actual else '[]'::jsonb end;
    if op = 'increment' then
      v := to_jsonb(coalesce(case when jsonb_typeof(actual) = 'number' then actual::text::numeric end, 0) + coalesce((v->>'n')::numeric, 0));
    elsif op = 'arrayUnion' then
      v := lista || coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(v->'v', '[]'::jsonb)) e where not lista @> jsonb_build_array(e)), '[]'::jsonb);
    elsif op = 'arrayRemove' then
      v := coalesce((select jsonb_agg(e) from jsonb_array_elements(lista) e where not coalesce(v->'v', '[]'::jsonb) @> jsonb_build_array(e)), '[]'::jsonb);
    elsif op = 'serverTimestamp' then
      v := to_jsonb(to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    doc := public.jsonb_poner_ruta(doc, ruta, v);
  end loop;
  return doc;
end $$;

-- ── 3. Escrituras atómicas ──
-- ops: [{ "tabla": "...", "claves": {"col": "valor", …}, "accion": "set" | "merge" | "update" | "delete",
--         "datos": {…}, "version": "…" (opcional; null = el registro no debía existir) }]
create or replace function public.escribir_documentos(ops jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  op jsonb; tabla text; accion text; cond text; cols text; vals text;
  previo jsonb; version_actual timestamptz; existe boolean; nuevo jsonb; n integer := 0;
begin
  for op in select * from jsonb_array_elements(ops) loop
    tabla := op->>'tabla';
    accion := op->>'accion';
    if tabla not in ('proyectos', 'proyecto_subcolecciones', 'contadores', 'licitaciones', 'licitacion_invitados',
      'licitacion_propuestas', 'licitacion_subcolecciones', 'proveedores', 'evaluaciones_desempeno', 'historial_obras_proveedor',
      'cotizaciones', 'inscripciones_proveedores', 'invitaciones_acceso') then
      raise exception 'TABLA_NO_PERMITIDA: %', tabla;
    end if;
    select string_agg(format('%I = %L', key, value), ' and '), string_agg(format('%I', key), ', '), string_agg(format('%L', value), ', ')
      into cond, cols, vals
      from jsonb_each_text(op->'claves');
    if cond is null then raise exception 'SIN_CLAVES: %', tabla; end if;

    execute format('select datos, actualizado_en from public.%I where %s for update', tabla, cond) into previo, version_actual;
    existe := version_actual is not null;

    -- Transacción optimista: el registro debe seguir como estaba cuando se leyó.
    if op ? 'version' then
      if (jsonb_typeof(op->'version') = 'null' and existe)
         or (jsonb_typeof(op->'version') <> 'null' and (not existe or version_actual <> (op->>'version')::timestamptz)) then
        raise exception 'CONFLICTO_TRANSACCION';
      end if;
    end if;

    if accion = 'delete' then
      if existe then execute format('delete from public.%I where %s', tabla, cond); end if;
    else
      if accion = 'update' and not existe then raise exception 'NO_EXISTE: %/%', tabla, op->>'claves'; end if;
      nuevo := case accion
        when 'set' then public.aplicar_cambios('{}'::jsonb, op->'datos')
        else public.aplicar_cambios(previo, op->'datos') end;
      if existe then
        execute format('update public.%I set datos = $1 where %s', tabla, cond) using nuevo;
      else
        execute format('insert into public.%I (%s, datos) values (%s, $1)', tabla, cols, vals) using nuevo;
      end if;
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.escribir_documentos(jsonb) to anon, authenticated;
grant execute on function public.aplicar_cambios(jsonb, jsonb) to anon, authenticated;

-- ── 4. Fechas copiadas de Firestore: {seconds, nanoseconds} → texto ISO ──
create or replace function public.normalizar_fechas(v jsonb) returns jsonb
language plpgsql immutable as $$
begin
  if jsonb_typeof(v) = 'object' then
    if v ? 'seconds' and v ? 'nanoseconds' and (select count(*) from jsonb_object_keys(v)) <= 3 then
      return to_jsonb(to_char(to_timestamp((v->>'seconds')::numeric + (v->>'nanoseconds')::numeric / 1e9) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    return coalesce((select jsonb_object_agg(key, public.normalizar_fechas(value)) from jsonb_each(v)), '{}'::jsonb);
  elsif jsonb_typeof(v) = 'array' then
    return coalesce((select jsonb_agg(public.normalizar_fechas(e)) from jsonb_array_elements(v) e), '[]'::jsonb);
  end if;
  return v;
end $$;

do $$
declare t text;
begin
  foreach t in array array['proyectos', 'proyecto_subcolecciones', 'contadores', 'licitaciones', 'licitacion_invitados',
    'licitacion_propuestas', 'licitacion_subcolecciones', 'proveedores', 'evaluaciones_desempeno', 'historial_obras_proveedor',
    'cotizaciones', 'inscripciones_proveedores'] loop
    execute format('update public.%I set datos = public.normalizar_fechas(datos) where datos::text like %L', t, '%"seconds"%');
  end loop;
end $$;
