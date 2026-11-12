-- 0022: cambio de unidad de una persona en el módulo de Asignación de Espacios. Un movimiento puede llevar la unidad
-- nueva de la persona (la que tendrá en el recinto de destino) y guarda la anterior para el historial. Un cambio de
-- unidad sin cambio de recinto es un movimiento con el mismo recinto de origen y de destino.
alter table public.asignacion_movimientos add column if not exists unidad_anterior text;
alter table public.asignacion_movimientos add column if not exists unidad_nueva text;
