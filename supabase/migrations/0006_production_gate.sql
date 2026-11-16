-- 0006: the production gate, enforced in the database as well as in the app.
-- An order can only enter Production when every item's latest proof is
-- approved. pipeline.ts checks this first and shows a friendly message;
-- this trigger makes sure no code path (or direct SQL) can skip it.

create or replace function public.guard_production_gate() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'production' and old.status is distinct from 'production' then
    if exists (
      select 1 from public.order_items i
      where i.order_id = new.id
        and coalesce((select p.status from public.proofs p
                      where p.order_item_id = i.id
                      order by p.version desc limit 1)::text, 'none') <> 'approved'
    ) or not exists (select 1 from public.order_items i where i.order_id = new.id) then
      raise exception 'Production needs an approved proof for every item';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists orders_production_gate on public.orders;
create trigger orders_production_gate before update of status on public.orders
  for each row execute function public.guard_production_gate();
