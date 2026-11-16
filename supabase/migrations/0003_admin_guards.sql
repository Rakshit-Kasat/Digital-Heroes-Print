-- Admin guards.
-- 1) Never leave the platform without an administrator. The app checks this
--    too, but the database is the last line: two admins demoting each other
--    at the same moment cannot both succeed.
create or replace function public.guard_last_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'admin' and new.role is distinct from 'admin' then
    perform 1 from public.profiles where role = 'admin' for update;
    if (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'At least one administrator must remain';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_last_admin on public.profiles;
create trigger profiles_last_admin before update on public.profiles
  for each row execute function public.guard_last_admin();

-- 2) The uploads bucket only accepts the artwork formats we support
--    (the server still checks the real bytes; this stops junk early).
update storage.buckets
   set allowed_mime_types = array['application/pdf','image/svg+xml','image/png','application/postscript','application/illustrator','text/csv','application/vnd.ms-excel','text/plain','application/octet-stream']
 where id = 'uploads';
