-- Violet POS - permisos API explicitos para Supabase Data API.
-- Ejecutar en Supabase > Editor SQL > New query > Run.
-- Necesario por el cambio de Supabase 2026: las tablas deben tener GRANT
-- explicitos para ser accesibles desde supabase-js/PostgREST/GraphQL.
-- RLS sigue protegiendo filas por auth.uid() = user_id.

begin;

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
    public.client_files,
    public.products
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public
grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
grant usage, select on sequences to authenticated;

commit;
