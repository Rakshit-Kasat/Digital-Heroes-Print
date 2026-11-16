-- Logos placed in the designer may be JPEG as well as PNG/SVG.
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'image/jpeg')
 where id = 'uploads' and not ('image/jpeg' = any(allowed_mime_types));
