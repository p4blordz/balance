-- Supabase schema for gastos app multi-user support
create extension if not exists pgcrypto;

drop table if exists public.movimientos cascade;

create table public.movimientos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('gasto', 'ingreso_mes', 'ahorro_in', 'ahorro_mov')),
  cat text,
  "desc" text,
  monto numeric not null,
  mes text not null,
  anio int not null,
  created timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists movimientos_user_created_idx
  on public.movimientos (user_id, created desc);

create index if not exists movimientos_user_mes_anio_idx
  on public.movimientos (user_id, anio desc, mes);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_movimientos_updated_at on public.movimientos;
create trigger trg_movimientos_updated_at
before update on public.movimientos
for each row
execute function public.set_updated_at();

alter table public.movimientos enable row level security;

drop policy if exists select_own on public.movimientos;
create policy select_own
  on public.movimientos
  for select
  using (auth.uid() = user_id);

drop policy if exists insert_own on public.movimientos;
create policy insert_own
  on public.movimientos
  for insert
  with check (auth.uid() = user_id);

drop policy if exists update_own on public.movimientos;
create policy update_own
  on public.movimientos
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists delete_own on public.movimientos;
create policy delete_own
  on public.movimientos
  for delete
  using (auth.uid() = user_id);
