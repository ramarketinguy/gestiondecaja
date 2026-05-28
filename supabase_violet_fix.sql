-- Violet POS - ajuste de esquema y seguridad
-- Ejecutar en Supabase > Editor SQL > New query > Run.

begin;

-- 1) Columnas necesarias para separar datos por usuario autenticado.
alter table public.clients
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.appointments
    add column if not exists user_id uuid references auth.users(id) on delete cascade,
    add column if not exists service_id uuid;

alter table public.transactions
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.employees
    add column if not exists user_id uuid references auth.users(id) on delete cascade,
    add column if not exists color text default '#7b52b5';

alter table public.services
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.tasks
    add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.closures
    add column if not exists user_id uuid references auth.users(id) on delete cascade,
    add column if not exists note text,
    add column if not exists created_by text;

-- 2) Tablas que faltan para configuracion del negocio y archivos de clientas.
create table if not exists public.business_config (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    open_time text default '09:00',
    close_time text default '20:00',
    lunch_start text,
    lunch_end text,
    closed_days jsonb default '[]'::jsonb,
    time_format text default '24h',
    blocked_slots jsonb default '[]'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (user_id)
);

create table if not exists public.client_files (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    client_id uuid references public.clients(id) on delete cascade,
    name text,
    url text not null,
    type text,
    created_at timestamptz default now()
);

-- 3) Backfill: asigna registros existentes al primer usuario creado.
-- Esto evita que desaparezcan al activar filtros por user_id.
with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.clients set user_id = (select id from first_user) where user_id is null;

with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.appointments set user_id = (select id from first_user) where user_id is null;

with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.transactions set user_id = (select id from first_user) where user_id is null;

with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.employees set user_id = (select id from first_user) where user_id is null;

with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.services set user_id = (select id from first_user) where user_id is null;

with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.tasks set user_id = (select id from first_user) where user_id is null;

with first_user as (
    select id from auth.users order by created_at asc limit 1
)
update public.closures set user_id = (select id from first_user) where user_id is null;

-- 4) Defaults para que los nuevos registros guarden el usuario actual automaticamente.
alter table public.clients alter column user_id set default auth.uid();
alter table public.appointments alter column user_id set default auth.uid();
alter table public.transactions alter column user_id set default auth.uid();
alter table public.employees alter column user_id set default auth.uid();
alter table public.services alter column user_id set default auth.uid();
alter table public.tasks alter column user_id set default auth.uid();
alter table public.closures alter column user_id set default auth.uid();
alter table public.business_config alter column user_id set default auth.uid();
alter table public.client_files alter column user_id set default auth.uid();

-- 5) Indices para que la app cargue rapido.
create index if not exists idx_clients_user_id on public.clients(user_id);
create index if not exists idx_appointments_user_id_date on public.appointments(user_id, apt_date);
create index if not exists idx_transactions_user_id_date on public.transactions(user_id, transaction_date);
create index if not exists idx_employees_user_id on public.employees(user_id);
create index if not exists idx_services_user_id on public.services(user_id);
create index if not exists idx_tasks_user_id on public.tasks(user_id);
create index if not exists idx_closures_user_id_date on public.closures(user_id, closure_date);
create index if not exists idx_client_files_client_id on public.client_files(client_id);

-- 6) Permisos API explicitos para supabase-js/PostgREST.
-- RLS sigue filtrando filas por usuario autenticado.
grant usage on schema public to authenticated;

grant select, insert, update, delete on table
    public.clients,
    public.appointments,
    public.transactions,
    public.employees,
    public.services,
    public.tasks,
    public.closures,
    public.business_config,
    public.client_files
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
grant usage, select on sequences to authenticated;

-- 7) Activar RLS y permitir que cada usuario autenticado gestione sus datos.
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.transactions enable row level security;
alter table public.employees enable row level security;
alter table public.services enable row level security;
alter table public.tasks enable row level security;
alter table public.closures enable row level security;
alter table public.business_config enable row level security;
alter table public.client_files enable row level security;

drop policy if exists "violet_owner_all_clients" on public.clients;
create policy "violet_owner_all_clients" on public.clients
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "violet_owner_all_appointments" on public.appointments;
create policy "violet_owner_all_appointments" on public.appointments
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "violet_owner_all_transactions" on public.transactions;
create policy "violet_owner_all_transactions" on public.transactions
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "violet_owner_all_employees" on public.employees;
create policy "violet_owner_all_employees" on public.employees
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "violet_owner_all_services" on public.services;
create policy "violet_owner_all_services" on public.services
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "violet_owner_all_tasks" on public.tasks;
create policy "violet_owner_all_tasks" on public.tasks
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "violet_owner_all_closures" on public.closures;
create policy "violet_owner_all_closures" on public.closures
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "violet_owner_all_business_config" on public.business_config;
create policy "violet_owner_all_business_config" on public.business_config
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

drop policy if exists "violet_owner_all_client_files" on public.client_files;
create policy "violet_owner_all_client_files" on public.client_files
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

commit;
