-- 0012: plano general (o ilustración) de cada campus.
-- Se guarda en el mismo almacenamiento de las láminas, en «laminas/campus/<SIGLA>/», con las mismas reglas de acceso
-- (solo personal UCT, política laminas_personal de la migración 0004). Hasta ahora ese almacenamiento solo aceptaba PDF:
-- se agregan las imágenes para poder subir una ilustración del campus.
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
 where id = 'laminas';
