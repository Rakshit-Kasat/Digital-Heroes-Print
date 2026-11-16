-- =====================================================================
-- Digital Heroes web-to-print — initial schema
-- Why: one structured backend for catalogue, designs, orders, proofs and
-- production files. Every table has Row Level Security (RLS): customers
-- only ever see their own rows; admins see everything; production files
-- are admin-only (PRD §10: "the customer never sees production files").
-- Money is stored as integer pence to avoid floating-point rounding errors.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- enums ----------------------------------------------------
create type public.user_role    as enum ('customer', 'admin');
-- The six pipeline stages from PRD §11, in order.
create type public.order_status as enum ('quote', 'order', 'artwork', 'proof', 'production', 'completed');
create type public.proof_status as enum ('pending', 'approved', 'changes_requested', 'superseded');

-- ---------- helpers ----------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ---------- organisations (scalability: corporate / multi-account) -----
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- ---------- profiles (1:1 with auth.users) -----------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  full_name       text,
  company         text,
  phone           text,
  role            public.user_role not null default 'customer',
  organization_id uuid references public.organizations (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organization_id);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- is_admin(): used inside policies. SECURITY DEFINER so it can read
-- profiles without recursing into the profiles RLS policy.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- New auth user -> profile row (role always starts as customer).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Stop a customer promoting themselves: only an admin (or the server's
-- service role, where auth.uid() is null) may change role/organisation.
create or replace function public.guard_profile_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.role is distinct from old.role or new.organization_id is distinct from old.organization_id)
     and (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Only an administrator can change roles';
  end if;
  return new;
end $$;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------- catalogue --------------------------------------------------
-- A division = one of the six print ranges. New division = new row.
create table public.divisions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  tagline     text not null default '',
  description text not null default '',
  sort        int  not null default 0,
  active      boolean not null default true
);

-- A product is parameter-driven (PRD §04): one row models every size,
-- material and quantity through config_schema + pricing JSON.
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  division_id   uuid not null references public.divisions (id) on delete restrict,
  slug          text not null unique,
  name          text not null,
  summary       text not null default '',
  description   text not null default '',
  config_schema jsonb not null,   -- sizes, presets, materials, quantity limits
  pricing       jsonb not null,   -- rate per cm², base, minimum, volume tiers
  bleed_mm      numeric(5,2) not null default 3,
  safe_mm       numeric(5,2) not null default 3,
  dpi           int  not null default 300,
  supports_csv  boolean not null default false, -- variable-data (race numbers)
  active        boolean not null default true,
  sort          int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index products_division_idx on public.products (division_id);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

-- Templates store a size-independent layout (relative 0..1 units) so one
-- template fits any configured size.
create table public.templates (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name       text not null,
  design     jsonb not null,
  sort       int not null default 0,
  active     boolean not null default true
);
create index templates_product_idx on public.templates (product_id);

-- ---------- designs (saved artwork) ------------------------------------
create table public.designs (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  product_id  uuid not null references public.products (id),
  template_id uuid references public.templates (id) on delete set null,
  name        text not null default 'Untitled design',
  config      jsonb not null,          -- width, height, material, quantity...
  doc         jsonb,                   -- designer document (mm units)
  upload_path text,                    -- or: a customer-uploaded finished file
  upload_kind text check (upload_kind in ('pdf','svg','png','ai')),
  is_saved    boolean not null default false, -- shown in "saved designs"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (doc is not null or upload_path is not null)
);
create index designs_owner_idx on public.designs (owner_id);
create trigger designs_touch before update on public.designs
  for each row execute function public.touch_updated_at();

-- ---------- orders -----------------------------------------------------
create sequence public.order_number_seq start 1001;

create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  number                text not null unique
                        default ('DH-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  customer_id           uuid not null references public.profiles (id),
  organization_id       uuid references public.organizations (id),
  status                public.order_status not null default 'quote',
  currency              text not null default 'GBP',
  vat_rate              numeric(5,4) not null,
  subtotal_pence        int not null check (subtotal_pence >= 0), -- ex VAT
  vat_pence             int not null check (vat_pence >= 0),
  total_pence           int not null check (total_pence >= 0),    -- inc VAT
  stripe_session_id     text unique,
  stripe_payment_intent text,
  paid_at               timestamptz,
  archived_at           timestamptz,
  reorder_of            uuid references public.orders (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_status_idx   on public.orders (status, created_at desc);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

create table public.order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders (id) on delete cascade,
  product_id        uuid not null references public.products (id),
  design_id         uuid references public.designs (id) on delete set null,
  product_snapshot  jsonb not null,  -- name/division/bleed/dpi at time of order
  config            jsonb not null,
  quantity          int not null check (quantity > 0),
  unit_price_pence  int not null,
  discount_rate     numeric(5,4) not null default 0,
  line_total_pence  int not null,    -- ex VAT
  csv_path          text,            -- variable-data CSV (race numbers)
  csv_rows          int
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------- proofs & approvals (PRD §08) -------------------------------
create table public.proofs (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  version       int  not null check (version > 0),
  png_path      text not null,
  svg_path      text,
  status        public.proof_status not null default 'pending',
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  unique (order_item_id, version)
);

create table public.proof_events (
  id         uuid primary key default gen_random_uuid(),
  proof_id   uuid not null references public.proofs (id) on delete cascade,
  actor_id   uuid references public.profiles (id),
  action     text not null check (action in ('created','approved','changes_requested')),
  note       text,
  created_at timestamptz not null default now()
);
create index proof_events_proof_idx on public.proof_events (proof_id);

create table public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status   public.order_status not null,
  actor_id    uuid references public.profiles (id),
  note        text,
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

-- ---------- production files (admin only) ------------------------------
create table public.print_files (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  kind          text not null check (kind in ('pdf','png','svg','zip','source')),
  path          text not null,
  bytes         int,
  created_at    timestamptz not null default now()
);
create index print_files_item_idx on public.print_files (order_item_id);

create table public.invoices (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null unique references public.orders (id) on delete cascade,
  number    text not null unique,
  pdf_path  text not null,
  issued_at timestamptz not null default now()
);

create table public.email_log (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null,
  template   text not null,
  order_id   uuid references public.orders (id) on delete set null,
  status     text not null check (status in ('sent','failed','skipped')),
  error      text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.divisions     enable row level security;
alter table public.products      enable row level security;
alter table public.templates     enable row level security;
alter table public.designs       enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;
alter table public.proofs        enable row level security;
alter table public.proof_events  enable row level security;
alter table public.order_events  enable row level security;
alter table public.print_files   enable row level security;
alter table public.invoices      enable row level security;
alter table public.email_log     enable row level security;

-- profiles: you see/edit yourself; admins see/edit all.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

create policy orgs_select on public.organizations for select to authenticated
  using (public.is_admin() or id in (select organization_id from public.profiles where id = (select auth.uid())));
create policy orgs_admin on public.organizations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- catalogue: public can read active rows; only admins write.
create policy divisions_read on public.divisions for select to anon, authenticated
  using (active or public.is_admin());
create policy divisions_admin on public.divisions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy products_read on public.products for select to anon, authenticated
  using (active or public.is_admin());
create policy products_admin on public.products for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy templates_read on public.templates for select to anon, authenticated
  using (active or public.is_admin());
create policy templates_admin on public.templates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- designs: owners have full control of their own; admins can read all.
create policy designs_owner on public.designs for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy designs_admin_read on public.designs for select to authenticated
  using (public.is_admin());

-- orders and children: customers READ their own; all writes go through
-- server code (service role) after validation, so there are no customer
-- insert/update policies — a customer cannot change price or status.
create policy orders_read on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_admin());
create policy orders_admin on public.orders for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy items_read on public.order_items for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o
         where o.id = order_id and o.customer_id = (select auth.uid())));
create policy proofs_read on public.proofs for select to authenticated
  using (public.is_admin() or exists (select 1 from public.order_items i join public.orders o on o.id = i.order_id
         where i.id = order_item_id and o.customer_id = (select auth.uid())));
create policy proof_events_read on public.proof_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.proofs p join public.order_items i on i.id = p.order_item_id
         join public.orders o on o.id = i.order_id where p.id = proof_id and o.customer_id = (select auth.uid())));
create policy order_events_read on public.order_events for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o
         where o.id = order_id and o.customer_id = (select auth.uid())));
create policy invoices_read on public.invoices for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o
         where o.id = order_id and o.customer_id = (select auth.uid())));

-- production files + email log: admins only. No customer policy exists.
create policy print_files_admin on public.print_files for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy email_log_admin on public.email_log for select to authenticated
  using (public.is_admin());

-- =====================================================================
-- Reports (PRD §11.05). security_invoker => the caller's RLS applies,
-- so a customer querying these only ever sees their own numbers.
-- =====================================================================
create view public.report_revenue_by_month with (security_invoker = true) as
  select date_trunc('month', paid_at)::date as month,
         count(*)::int as orders, sum(total_pence)::bigint as revenue_pence
  from public.orders where paid_at is not null
  group by 1 order by 1 desc;

create view public.report_orders_by_status with (security_invoker = true) as
  select status, count(*)::int as orders from public.orders
  where archived_at is null group by status;

create view public.report_division_throughput with (security_invoker = true) as
  select d.name as division, count(distinct o.id)::int as orders,
         coalesce(sum(i.quantity), 0)::bigint as units,
         coalesce(sum(i.line_total_pence), 0)::bigint as revenue_ex_vat_pence
  from public.divisions d
  left join public.products p on p.division_id = d.id
  left join public.order_items i on i.product_id = p.id
  left join public.orders o on o.id = i.order_id and o.paid_at is not null
  group by d.name, d.sort order by d.sort;

-- =====================================================================
-- Storage buckets (all private; the server hands out short-lived signed
-- URLs after checking ownership).
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit) values
  ('uploads',     'uploads',     false, 15728640),  -- customer artwork, 15 MB
  ('proofs',      'proofs',      false, null),
  ('print-files', 'print-files', false, null),
  ('invoices',    'invoices',    false, null)
on conflict (id) do nothing;

-- Customers may upload into, and read from, their own folder in "uploads"
-- (path = <user id>/<file>). Everything else is server-only.
create policy uploads_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy uploads_own_read on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin()));
