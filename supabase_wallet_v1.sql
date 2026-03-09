-- Wallet integration schema (Mercado Pago v1)
-- Safe to run multiple times.

create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.wallet_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_account_id text,
  status text not null default 'connected' check (status in ('connected', 'disconnected', 'error')),
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wallet_connections_user_provider_account_uq
  on public.wallet_connections (user_id, provider, provider_account_id);

create index if not exists wallet_connections_user_provider_idx
  on public.wallet_connections (user_id, provider);

drop trigger if exists trg_wallet_connections_updated_at on public.wallet_connections;
create trigger trg_wallet_connections_updated_at
before update on public.wallet_connections
for each row
execute function public.set_updated_at();

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.wallet_connections(id) on delete cascade,
  provider text not null,
  provider_tx_id text not null,
  occurred_at timestamptz not null,
  description text,
  amount numeric not null,
  currency text not null default 'ARS',
  raw_payload jsonb,
  suggested_cat text,
  selected_cat text,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'skipped', 'imported')),
  movement_id uuid references public.movimientos(id) on delete set null,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists wallet_transactions_user_provider_tx_uq
  on public.wallet_transactions (user_id, provider, provider_tx_id);

create index if not exists wallet_transactions_connection_status_idx
  on public.wallet_transactions (connection_id, review_status, occurred_at desc);

drop trigger if exists trg_wallet_transactions_updated_at on public.wallet_transactions;
create trigger trg_wallet_transactions_updated_at
before update on public.wallet_transactions
for each row
execute function public.set_updated_at();

create table if not exists public.wallet_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid references public.wallet_connections(id) on delete set null,
  provider text not null,
  date_from date,
  date_to date,
  fetched_count int not null default 0,
  pending_count int not null default 0,
  duplicated_count int not null default 0,
  status text not null default 'ok' check (status in ('ok', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_sync_runs_user_provider_created_idx
  on public.wallet_sync_runs (user_id, provider, created_at desc);

create table if not exists private.wallet_connection_tokens (
  connection_id uuid primary key references public.wallet_connections(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  scope text,
  token_type text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_wallet_connection_tokens_updated_at on private.wallet_connection_tokens;
create trigger trg_wallet_connection_tokens_updated_at
before update on private.wallet_connection_tokens
for each row
execute function public.set_updated_at();

create table if not exists private.wallet_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists wallet_oauth_states_expires_idx
  on private.wallet_oauth_states (expires_at);

alter table public.wallet_connections enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_sync_runs enable row level security;

drop policy if exists wallet_connections_select_own on public.wallet_connections;
create policy wallet_connections_select_own
  on public.wallet_connections
  for select
  using (auth.uid() = user_id);

drop policy if exists wallet_connections_insert_own on public.wallet_connections;
create policy wallet_connections_insert_own
  on public.wallet_connections
  for insert
  with check (auth.uid() = user_id);

drop policy if exists wallet_connections_update_own on public.wallet_connections;
create policy wallet_connections_update_own
  on public.wallet_connections
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists wallet_connections_delete_own on public.wallet_connections;
create policy wallet_connections_delete_own
  on public.wallet_connections
  for delete
  using (auth.uid() = user_id);

drop policy if exists wallet_transactions_select_own on public.wallet_transactions;
create policy wallet_transactions_select_own
  on public.wallet_transactions
  for select
  using (auth.uid() = user_id);

drop policy if exists wallet_transactions_insert_own on public.wallet_transactions;
create policy wallet_transactions_insert_own
  on public.wallet_transactions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists wallet_transactions_update_own on public.wallet_transactions;
create policy wallet_transactions_update_own
  on public.wallet_transactions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists wallet_transactions_delete_own on public.wallet_transactions;
create policy wallet_transactions_delete_own
  on public.wallet_transactions
  for delete
  using (auth.uid() = user_id);

drop policy if exists wallet_sync_runs_select_own on public.wallet_sync_runs;
create policy wallet_sync_runs_select_own
  on public.wallet_sync_runs
  for select
  using (auth.uid() = user_id);

drop policy if exists wallet_sync_runs_insert_own on public.wallet_sync_runs;
create policy wallet_sync_runs_insert_own
  on public.wallet_sync_runs
  for insert
  with check (auth.uid() = user_id);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.wallet_connections to authenticated;
grant select, insert, update, delete on public.wallet_transactions to authenticated;
grant select, insert on public.wallet_sync_runs to authenticated;

revoke all on schema private from anon;
revoke all on schema private from authenticated;
revoke all on all tables in schema private from anon;
revoke all on all tables in schema private from authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on all tables in schema private to service_role;
