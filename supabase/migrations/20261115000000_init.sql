-- Business Expense Tracker: initial schema
--
-- Safe to run more than once: every statement is guarded (if not exists,
-- create or replace, drop ... if exists) so re-applying it changes nothing.
--
-- Design notes
--   * Money is stored as bigint satang (1 baht = 100 satang). No floating point.
--   * Every row carries user_id, and Row Level Security restricts each user to
--     their own rows for every operation.
--   * A transaction's category must belong to the same user and have the same
--     type. That is enforced by a composite foreign key, not by application code.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  type text not null check (type in ('income', 'expense')),
  color text not null default 'slate'
    check (color in ('clay', 'ochre', 'moss', 'pine', 'slate', 'plum', 'rose', 'ink')),
  created_at timestamptz not null default now(),
  -- Target of the composite foreign key on transactions.
  constraint categories_id_user_type_key unique (id, user_id, type)
);

-- A user cannot have two categories of the same type whose names differ only
-- by letter case or surrounding spaces.
create unique index if not exists categories_user_type_name_key
  on public.categories (user_id, type, lower(btrim(name)));

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  type text not null check (type in ('income', 'expense')),
  amount_satang bigint not null check (amount_satang > 0 and amount_satang <= 999999999999),
  description text not null check (char_length(btrim(description)) between 1 and 200),
  transaction_date date not null
    check (transaction_date between date '2000-01-01' and date '2100-12-31'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The category must exist, belong to the same user and have the same type.
  -- NO ACTION (rather than RESTRICT) still blocks deleting a category that is
  -- in use, but is checked at the end of the statement, so deleting an account
  -- can cascade through both tables.
  constraint transactions_category_fkey
    foreign key (category_id, user_id, type)
    references public.categories (id, user_id, type)
    on update no action
    on delete no action
);

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc, created_at desc);

create index if not exists transactions_category_idx
  on public.transactions (category_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- Creates the profile and the starting categories for each new account.
-- Runs as the function owner because the signing-up user has no session yet.
-- raw_user_meta_data is user-supplied, so it is trimmed and length-limited here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(requested_name, ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'ผู้ใช้ใหม่'), 60)
  )
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, type, color)
  values
    (new.id, 'ค่าบริการและงานโปรเจกต์', 'income', 'moss'),
    (new.id, 'ขายสินค้า', 'income', 'ochre'),
    (new.id, 'รายรับอื่น ๆ', 'income', 'slate'),
    (new.id, 'ค่าเช่าและสถานที่', 'expense', 'slate'),
    (new.id, 'ซอฟต์แวร์และเครื่องมือ', 'expense', 'pine'),
    (new.id, 'การตลาดและโฆษณา', 'expense', 'clay'),
    (new.id, 'เดินทางและขนส่ง', 'expense', 'ochre'),
    (new.id, 'อุปกรณ์สำนักงาน', 'expense', 'moss'),
    (new.id, 'ค่าจ้างและผู้รับเหมา', 'expense', 'plum'),
    (new.id, 'ภาษีและค่าธรรมเนียม', 'expense', 'ink'),
    (new.id, 'รายจ่ายอื่น ๆ', 'expense', 'rose')
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privileges and Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;

-- Visitors who are not signed in get nothing at all.
revoke all on public.profiles, public.categories, public.transactions from anon;
revoke all on public.profiles, public.categories, public.transactions from authenticated;

grant select, update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;

-- profiles: read and rename yourself. Rows are created by the trigger above
-- and removed when the account is deleted.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- categories: full access to your own rows only.
drop policy if exists "categories_select_own" on public.categories;
create policy "categories_select_own" on public.categories
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "categories_insert_own" on public.categories;
create policy "categories_insert_own" on public.categories
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "categories_update_own" on public.categories;
create policy "categories_update_own" on public.categories
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_delete_own" on public.categories
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- transactions: full access to your own rows only.
drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated
  using ((select auth.uid()) = user_id);
