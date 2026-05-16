-- Violet POS - productos, turnos con multiples servicios y campos de auditoria.
-- Ejecutar en Supabase > Editor SQL > New query > Run.

begin;

alter table public.appointments
    add column if not exists services jsonb default '[]'::jsonb,
    add column if not exists duration integer,
    add column if not exists end_time text;

alter table public.transactions
    add column if not exists products jsonb default '[]'::jsonb,
    add column if not exists product_total numeric default 0,
    add column if not exists employee_id uuid references public.employees(id) on delete set null;

alter table public.business_config
    add column if not exists weekly_hours jsonb;

create table if not exists public.products (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    name text not null,
    price numeric default 0,
    stock numeric,
    active boolean default true,
    created_at timestamptz default now()
);

with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.products set user_id = (select id from first_user) where user_id is null;

create index if not exists idx_products_user_id on public.products(user_id);
create index if not exists idx_products_active on public.products(active);
create index if not exists idx_transactions_employee_id on public.transactions(employee_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.products to authenticated;

alter table public.products enable row level security;

drop policy if exists "violet_owner_all_products" on public.products;
create policy "violet_owner_all_products" on public.products
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

commit;
