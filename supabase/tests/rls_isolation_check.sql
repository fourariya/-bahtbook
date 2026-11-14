-- Row Level Security isolation check between two real accounts.
--
-- Use it on a TEST project only. Run it in the Supabase SQL Editor after:
--   1. the migration in supabase/migrations has been applied, and
--   2. two users exist under Authentication > Users (created AFTER the migration,
--      so each one has its profile and default categories).
--
-- Edit the two email addresses below, then run the whole file.
--
-- What it does: acting as user A it creates one transaction, then acting as
-- user B and as a signed-out visitor it tries to read, change, delete and forge
-- data. Every attempt must be blocked. It stops with an error naming the first
-- check that fails. It deletes its own row at the end, and if anything fails
-- the whole block is rolled back, so it leaves no data behind either way.

do $$
declare
  email_a text := 'user-a@example.com';  -- EDIT: first test user
  email_b text := 'user-b@example.com';  -- EDIT: second test user

  a uuid;
  b uuid;
  category_a uuid;
  category_b uuid;
  transaction_a uuid;
  affected integer;
  blocked boolean;
begin
  select id into a from auth.users where email = email_a;
  select id into b from auth.users where email = email_b;
  if a is null or b is null then
    raise exception 'Setup: both test users must exist. Check the two email addresses at the top.';
  end if;
  if a = b then
    raise exception 'Setup: the two email addresses must belong to different users.';
  end if;

  select id into category_a from public.categories where user_id = a and type = 'expense' limit 1;
  select id into category_b from public.categories where user_id = b and type = 'expense' limit 1;
  if category_a is null or category_b is null then
    raise exception 'Setup: a test user has no categories. Create the users after applying the migration.';
  end if;

  -- ---- act as user A: create a row -------------------------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);

  insert into public.transactions (category_id, type, amount_satang, description, transaction_date)
  values (category_a, 'expense', 12345, 'RLS isolation check (safe to delete)', current_date)
  returning id into transaction_a;

  select count(*) into affected from public.transactions where id = transaction_a and user_id = a;
  if affected <> 1 then
    raise exception 'Check 1 failed: user A cannot read the row it just created.';
  end if;

  -- ---- act as user B: every attempt on A''s data must fail ----------------
  perform set_config('request.jwt.claim.sub', b::text, true);

  select count(*) into affected from public.transactions where id = transaction_a;
  if affected <> 0 then
    raise exception 'Check 2 failed: user B can READ a transaction that belongs to user A.';
  end if;

  update public.transactions set amount_satang = 1 where id = transaction_a;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'Check 3 failed: user B can UPDATE a transaction that belongs to user A.';
  end if;

  delete from public.transactions where id = transaction_a;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'Check 4 failed: user B can DELETE a transaction that belongs to user A.';
  end if;

  blocked := false;
  begin
    insert into public.transactions (user_id, category_id, type, amount_satang, description, transaction_date)
    values (a, category_a, 'expense', 100, 'forged', current_date);
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'Check 5 failed: user B can INSERT a transaction in the name of user A.';
  end if;

  blocked := false;
  begin
    insert into public.transactions (category_id, type, amount_satang, description, transaction_date)
    values (category_a, 'expense', 100, 'borrowed category', current_date);
  exception when foreign_key_violation then
    blocked := true;
  end;
  if not blocked then
    raise exception 'Check 6 failed: user B can use a category that belongs to user A.';
  end if;

  select count(*) into affected from public.categories where user_id = a;
  if affected <> 0 then
    raise exception 'Check 7 failed: user B can read the categories of user A.';
  end if;

  select count(*) into affected from public.profiles where id = a;
  if affected <> 0 then
    raise exception 'Check 8 failed: user B can read the profile of user A.';
  end if;

  -- ---- act as a signed-out visitor ----------------------------------------
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);

  blocked := false;
  begin
    select count(*) into affected from public.transactions;
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then
    raise exception 'Check 9 failed: a signed-out visitor can query the transactions table.';
  end if;

  -- ---- back to user A: the row is intact, then clean up ---------------------
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', a::text, true);

  select count(*) into affected
  from public.transactions
  where id = transaction_a and amount_satang = 12345;
  if affected <> 1 then
    raise exception 'Check 10 failed: the transaction of user A was changed or removed.';
  end if;

  delete from public.transactions where id = transaction_a;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Cleanup failed: user A could not delete its own check row.';
  end if;

  reset role;
end;
$$;

-- Reached only when every check above passed.
select 'PASS: 10 of 10 RLS isolation checks' as result;
