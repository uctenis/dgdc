-- 0024: etapa 3 de la unificación, fase B — los archivos nuevos se guardan en Supabase Storage (depósito
-- «archivos-sistema», creado en la 0011) en vez de pedazos en Firestore. Las reglas van por carpeta:
--
--   interno/<id>/<nombre>                          solo personal UCT
--   invitados/<licitación>/<id>/<nombre>           lo sube el personal; lo ven los invitados a esa licitación
--   oferta/<licitación>/<empresa>/<id>/<nombre>    la empresa invitada lo sube dentro del plazo y solo ve lo suyo
--   inscripcion/<código>/<id>/<nombre>             la empresa lo sube sin sesión mientras su inscripción esté abierta
--
-- Sin sesión solo se puede SUBIR: leer permitiría listar la carpeta «inscripcion/» y descubrir los códigos de otras
-- empresas (el almacenamiento no distingue abrir de listar). El personal UCT lo ve todo.
-- Los archivos antiguos siguen en Firestore y se abren como antes.

-- Inscripción abierta (con permisos propios: quien llama no puede leer la tabla de inscripciones).
create or replace function public.inscripcion_abierta(p_codigo text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.inscripciones_proveedores
                 where codigo = p_codigo and coalesce(p_codigo, '') <> '' and estado in ('Invitada', 'Observada'))
$$;
revoke all on function public.inscripcion_abierta(text) from public;
grant execute on function public.inscripcion_abierta(text) to anon, authenticated;

drop policy if exists archivos_sistema_uct on storage.objects;
create policy archivos_sistema_uct on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'archivos-sistema' and public.es_personal_uct())
  with check (bucket_id = 'archivos-sistema' and public.es_personal_uct());

-- Antecedentes de la licitación: los ven sus invitados.
drop policy if exists archivos_invitados_ver on storage.objects;
create policy archivos_invitados_ver on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'archivos-sistema' and (storage.foldername(name))[1] = 'invitados'
         and public.es_invitado_licitacion((storage.foldername(name))[2]));

-- Oferta: la empresa invitada la sube dentro del plazo y solo ve la suya.
drop policy if exists archivos_oferta_subir on storage.objects;
create policy archivos_oferta_subir on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'archivos-sistema' and (storage.foldername(name))[1] = 'oferta'
              and (storage.foldername(name))[3] = public.mi_proveedor_id()
              and public.es_invitado_licitacion((storage.foldername(name))[2])
              and public.dentro_de_plazo((storage.foldername(name))[2]));
drop policy if exists archivos_oferta_ver on storage.objects;
create policy archivos_oferta_ver on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'archivos-sistema' and (storage.foldername(name))[1] = 'oferta'
         and (storage.foldername(name))[3] = public.mi_proveedor_id());

-- Inscripción: la empresa sube sus documentos con el código de su enlace, mientras esté Invitada u Observada.
drop policy if exists archivos_inscripcion_subir on storage.objects;
create policy archivos_inscripcion_subir on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'archivos-sistema' and (storage.foldername(name))[1] = 'inscripcion'
              and public.inscripcion_abierta((storage.foldername(name))[2]));
