-- 0005: database-side guards found in the pre-launch security review.
--
-- 1. designs: a customer can write their own design rows with the public
--    key, so the server's path checks alone are not enough. This trigger
--    repeats them in the database: every file a design points at (upload,
--    CSV list, images inside the document) must sit in the owner's own
--    uploads folder, with plain path segments (no "..", "%", "\").
--    Server code using the service role (auth.uid() is null) is trusted.
-- 2. profiles: a customer cannot change the email we send orders to; it
--    must stay the address they signed in with.
-- 3. report_division_throughput: count only paid orders (the old left
--    join still added up units and money from unpaid quotes).

create or replace function public.is_owned_upload(path text, owner uuid)
returns boolean language sql immutable set search_path = '' as $$
  select path is null
      or (length(path) <= 512
          and path ~ ('^uploads/' || owner::text || '/[A-Za-z0-9_][A-Za-z0-9_.-]*(/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$'))
$$;

create or replace function public.guard_design_paths() returns trigger
language plpgsql set search_path = '' as $$
declare
  el jsonb;
begin
  if (select auth.uid()) is null then
    return new; -- service role (our own server code)
  end if;
  if not public.is_owned_upload(new.upload_path, new.owner_id)
     or not public.is_owned_upload(new.config ->> 'csvPath', new.owner_id) then
    raise exception 'Files must be uploaded through the designer';
  end if;
  if new.doc is not null and jsonb_typeof(new.doc -> 'elements') = 'array' then
    for el in select * from jsonb_array_elements(new.doc -> 'elements') loop
      if el ->> 'type' = 'image' and not public.is_owned_upload(el ->> 'src', new.owner_id) then
        raise exception 'Images must be uploaded through the designer';
      end if;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists designs_path_guard on public.designs;
create trigger designs_path_guard before insert or update on public.designs
  for each row execute function public.guard_design_paths();

create or replace function public.guard_profile_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email and (select auth.uid()) is not null
     and new.email is distinct from (select u.email from auth.users u where u.id = new.id) then
    raise exception 'Your email is the one you sign in with';
  end if;
  return new;
end $$;

drop trigger if exists profiles_email_guard on public.profiles;
create trigger profiles_email_guard before update on public.profiles
  for each row execute function public.guard_profile_email();

create or replace view public.report_division_throughput with (security_invoker = true) as
  select d.name as division, count(distinct paid.order_id)::int as orders,
         coalesce(sum(paid.quantity), 0)::bigint as units,
         coalesce(sum(paid.line_total_pence), 0)::bigint as revenue_ex_vat_pence
  from public.divisions d
  left join public.products p on p.division_id = d.id
  left join (
    select i.product_id, i.order_id, i.quantity, i.line_total_pence
    from public.order_items i
    join public.orders o on o.id = i.order_id
    where o.paid_at is not null
  ) paid on paid.product_id = p.id
  group by d.name, d.sort order by d.sort;
