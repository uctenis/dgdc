-- 0020: nómina vigente de funcionarios (planilla DDPER de Personas), para saber si los ocupantes de cada recinto
-- siguen en la universidad, sugerir nombres al editar y ver quiénes aún no tienen recinto.
-- Sin RUT: la persona se reconoce por su nombre normalizado («clave»). Los datos se cargan aparte (dgdc-datos),
-- nunca desde el repositorio, y se reemplazan completos con cada nómina nueva.
create table if not exists public.funcionarios (
  clave           text primary key,           -- nombre en mayúsculas, sin tildes ni signos («PEREZ SOTO, ANA MARIA»)
  nombre          text not null,              -- como viene en la nómina
  tipo_contrato   text,
  telefono        text,
  campus          text,                       -- ubicación según la nómina (D_UBICA)
  edificio_codigo text,                       -- código del edificio, si la nómina lo trae (CJP08)
  edificio        text,                       -- texto de la nómina (D_DIVISION)
  unidad          text,
  nomina          date not null               -- fecha de la planilla
);
alter table public.funcionarios enable row level security;
drop policy if exists funcionarios_lectura on public.funcionarios;
-- Solo lectura para el personal UCT; se escribe con la cuenta de administración.
create policy funcionarios_lectura on public.funcionarios for select to anon, authenticated using (public.es_personal_uct());
grant select on public.funcionarios to anon, authenticated;
