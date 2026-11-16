-- Freeze artwork: each proof keeps the exact design document it rendered, and
-- print files are generated from the APPROVED proof's document. Editing a
-- saved design later can never change what is printed for an existing order.
alter table public.proofs      add column if not exists doc jsonb;
alter table public.proofs      add column if not exists note text;      -- staff note sent with the proof
alter table public.order_items add column if not exists doc jsonb;      -- artwork snapshot at checkout
alter table public.order_items add column if not exists upload_path text; -- customer-supplied PDF/AI/PNG/SVG
alter table public.order_items add column if not exists upload_kind text;
create index if not exists proofs_item_idx on public.proofs (order_item_id, version desc);
create index if not exists print_files_item_idx on public.print_files (order_item_id);
