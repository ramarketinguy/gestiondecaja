-- Violet POS - parche para columnas de cierre de caja.
-- Ejecutar en Supabase > Editor SQL > New query > Run.

begin;

alter table public.closures
    add column if not exists closure_date timestamptz default now(),
    add column if not exists cash_amount numeric default 0,
    add column if not exists digital_amount numeric default 0,
    add column if not exists total_amount numeric default 0,
    add column if not exists income_amount numeric default 0,
    add column if not exists egress_amount numeric default 0,
    add column if not exists note text,
    add column if not exists created_by text,
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.closures alter column user_id set default auth.uid();

with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.closures set user_id = (select id from first_user) where user_id is null;

create index if not exists idx_closures_user_id_date on public.closures(user_id, closure_date);

alter table public.closures enable row level security;

drop policy if exists "violet_owner_all_closures" on public.closures;
create policy "violet_owner_all_closures" on public.closures
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

commit;
