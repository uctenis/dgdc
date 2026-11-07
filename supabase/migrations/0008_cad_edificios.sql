-- CAD (DWG) de cada edificio guardado en el sistema, para descargarlo directo desde «Planos y documentos».
-- Cada DWG es un documento (tipo Plano, formato DWG) cuyo archivo queda en el almacenamiento privado «cad».
alter table public.documentos add column if not exists archivo text;   -- ruta en «cad» ({edificio}/{documento}-{fecha}.dwg)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cad', 'cad', false, 104857600, null)
on conflict (id) do nothing;

drop policy if exists cad_personal on storage.objects;
create policy cad_personal on storage.objects for all to anon, authenticated
  using (bucket_id = 'cad' and public.es_personal_uct())
  with check (bucket_id = 'cad' and public.es_personal_uct());
