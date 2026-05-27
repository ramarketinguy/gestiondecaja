-- Violet POS - metadata editable para señas.
-- Ejecutar en Supabase > Editor SQL > New query > Run.

begin;

alter table public.transactions
    add column if not exists deposit_mode text default null,
    add column if not exists deposit_payment_method text default null,
    add column if not exists deposit_amount numeric default null,
    add column if not exists deposit_remaining numeric default null,
    add column if not exists deposit_status text default null,
    add column if not exists deposit_applied jsonb default '[]'::jsonb,
    add column if not exists deposit_discount_amount numeric default null,
    add column if not exists deposit_discount_scope text default null;

create index if not exists idx_transactions_deposit_client
    on public.transactions(client_id, deposit_status)
    where method = 'seña';

commit;
