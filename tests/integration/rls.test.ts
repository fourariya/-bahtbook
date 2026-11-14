import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PGlite, type Transaction as PgTransaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_CATEGORIES } from "@/lib/finance/default-categories";

/**
 * Runs the real migration files against PGlite, which is PostgreSQL compiled
 * to WebAssembly: the same parser, constraint checker and Row Level Security
 * engine as a Supabase database, with no Docker and no network.
 *
 * What is simulated: the pieces Supabase provides around Postgres. The shim
 * below creates `auth.users`, the `anon` / `authenticated` roles and
 * `auth.uid()`, which reads the same `request.jwt.claim.sub` setting that
 * Supabase's API layer sets from the signed-in user's token.
 *
 * What this does NOT cover: Supabase Auth itself (sign-up, passwords, email)
 * and the HTTP layer. Those need a real Supabase project; see README "Testing".
 */

const MIGRATIONS_DIR = fileURLToPath(new URL("../../supabase/migrations/", import.meta.url));
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort()
  .map((file) => readFileSync(`${MIGRATIONS_DIR}${file}`, "utf8"));

const SUPABASE_SHIM = `
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create role anon nologin;
  create role authenticated nologin;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema public, auth to anon, authenticated;
`;

let db: PGlite;
let alice: string;
let bob: string;

/** Runs `work` the way Supabase runs a request from a signed-in user. */
async function asUser<T>(userId: string, work: (tx: PgTransaction) => Promise<T>): Promise<T> {
  return (await db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return work(tx);
  })) as T;
}

/** Runs `work` as a visitor who is not signed in. */
async function asAnon<T>(work: (tx: PgTransaction) => Promise<T>): Promise<T> {
  return (await db.transaction(async (tx) => {
    await tx.exec("set local role anon");
    return work(tx);
  })) as T;
}

async function createUser(email: string, meta: Record<string, unknown> = {}): Promise<string> {
  const result = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify(meta)],
  );
  return result.rows[0].id;
}

async function categoryOf(userId: string, type: "income" | "expense"): Promise<string> {
  const result = await db.query<{ id: string }>(
    "select id from public.categories where user_id = $1 and type = $2 order by name limit 1",
    [userId, type],
  );
  return result.rows[0].id;
}

async function addTransaction(
  userId: string,
  overrides: Partial<{
    type: string;
    amount: number | string;
    description: string;
    date: string;
    categoryId: string;
  }> = {},
): Promise<string> {
  const type = overrides.type ?? "expense";
  const categoryId =
    overrides.categoryId ?? (await categoryOf(userId, type as "income" | "expense"));
  return asUser(userId, async (tx) => {
    const result = await tx.query<{ id: string }>(
      `insert into public.transactions (category_id, type, amount_satang, description, transaction_date)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        categoryId,
        type,
        overrides.amount ?? 125050,
        overrides.description ?? "ค่าโฮสติ้ง",
        overrides.date ?? "2026-11-15",
      ],
    );
    return result.rows[0].id;
  });
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_SHIM);
  for (const migration of MIGRATIONS) await db.exec(migration);
  alice = await createUser("alice@example.test", { display_name: "สตูดิโอของอลิซ" });
  bob = await createUser("bob@example.test", { display_name: "ร้านของบ็อบ" });
});

describe("migrations", () => {
  it("can be applied a second time without errors or duplicated data", async () => {
    for (const migration of MIGRATIONS) await db.exec(migration);
    const policies = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_policies where schemaname = 'public'",
    );
    expect(policies.rows[0].count).toBe(10);
    const categories = await db.query<{ count: number }>(
      "select count(*)::int as count from public.categories where user_id = $1",
      [alice],
    );
    expect(categories.rows[0].count).toBe(DEFAULT_CATEGORIES.length);
  });

  it("enables Row Level Security on every table", async () => {
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(tables.rows).toEqual([
      { relname: "categories", relrowsecurity: true },
      { relname: "profiles", relrowsecurity: true },
      { relname: "transactions", relrowsecurity: true },
    ]);
  });
});

describe("new account setup", () => {
  it("creates a profile from the sign-up metadata", async () => {
    const profile = await db.query<{ display_name: string }>(
      "select display_name from public.profiles where id = $1",
      [alice],
    );
    expect(profile.rows[0].display_name).toBe("สตูดิโอของอลิซ");
  });

  it("seeds exactly the default categories defined in the application", async () => {
    const seeded = await db.query<{ name: string; type: string; color: string }>(
      "select name, type, color from public.categories where user_id = $1",
      [bob],
    );
    const sort = (rows: Array<{ name: string; type: string; color: string }>) =>
      [...rows].sort((a, b) => `${a.type}${a.name}`.localeCompare(`${b.type}${b.name}`));
    expect(sort(seeded.rows)).toEqual(
      sort(DEFAULT_CATEGORIES.map((category) => ({ ...category }))),
    );
  });

  it("falls back to the email name and limits over-long or blank names", async () => {
    const plain = await createUser("carol@example.test");
    const blank = await createUser("dave@example.test", { display_name: "    " });
    const long = await createUser("erin@example.test", { display_name: "ก".repeat(500) });
    const names = await db.query<{ id: string; display_name: string }>(
      "select id, display_name from public.profiles where id = any($1)",
      [[plain, blank, long]],
    );
    const byId = new Map(names.rows.map((row) => [row.id, row.display_name]));
    expect(byId.get(plain)).toBe("carol");
    expect(byId.get(blank)).toBe("dave");
    expect(byId.get(long)).toHaveLength(60);
  });
});

describe("row level security: transactions", () => {
  let aliceTransaction: string;

  beforeAll(async () => {
    aliceTransaction = await addTransaction(alice, { description: "ของอลิซเท่านั้น" });
  });

  it("fills user_id from the session, not from the client", async () => {
    const row = await db.query<{ user_id: string }>(
      "select user_id from public.transactions where id = $1",
      [aliceTransaction],
    );
    expect(row.rows[0].user_id).toBe(alice);
  });

  it("lets the owner read their row and hides it from another user", async () => {
    const mine = await asUser(alice, (tx) => tx.query("select id from public.transactions"));
    const theirs = await asUser(bob, (tx) => tx.query("select id from public.transactions"));
    expect(mine.rows).toHaveLength(1);
    expect(theirs.rows).toHaveLength(0);
  });

  it("hides another user's row even when asked for by id", async () => {
    const result = await asUser(bob, (tx) =>
      tx.query("select * from public.transactions where id = $1", [aliceTransaction]),
    );
    expect(result.rows).toHaveLength(0);
  });

  it("silently affects no rows when another user tries to update or delete", async () => {
    const updated = await asUser(bob, (tx) =>
      tx.query("update public.transactions set amount_satang = 1 where id = $1", [
        aliceTransaction,
      ]),
    );
    const deleted = await asUser(bob, (tx) =>
      tx.query("delete from public.transactions where id = $1", [aliceTransaction]),
    );
    expect(updated.affectedRows).toBe(0);
    expect(deleted.affectedRows).toBe(0);

    const row = await db.query<{ amount_satang: unknown }>(
      "select amount_satang from public.transactions where id = $1",
      [aliceTransaction],
    );
    expect(String(row.rows[0].amount_satang)).toBe("125050");
  });

  it("rejects inserting a row on behalf of another user", async () => {
    const bobCategory = await categoryOf(bob, "expense");
    await expect(
      asUser(bob, (tx) =>
        tx.query(
          `insert into public.transactions (user_id, category_id, type, amount_satang, description, transaction_date)
           values ($1, $2, 'expense', 100, 'ปลอมเป็นอลิซ', '2026-11-15')`,
          [alice, bobCategory],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects using another user's category", async () => {
    const aliceCategory = await categoryOf(alice, "expense");
    await expect(
      asUser(bob, (tx) =>
        tx.query(
          `insert into public.transactions (category_id, type, amount_satang, description, transaction_date)
           values ($1, 'expense', 100, 'ใช้หมวดของคนอื่น', '2026-11-15')`,
          [aliceCategory],
        ),
      ),
    ).rejects.toThrow(/transactions_category_fkey/);
  });

  it("rejects handing your own row to another user", async () => {
    await expect(
      asUser(alice, (tx) =>
        tx.query("update public.transactions set user_id = $1 where id = $2", [
          bob,
          aliceTransaction,
        ]),
      ),
    ).rejects.toThrow(/row-level security|transactions_category_fkey/);
  });

  it("gives a signed-out visitor no access at all", async () => {
    for (const table of ["transactions", "categories", "profiles"]) {
      await expect(asAnon((tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(
        /permission denied/,
      );
    }
    await expect(asAnon((tx) => tx.query("delete from public.transactions"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("row level security: categories and profiles", () => {
  it("shows each user only their own categories", async () => {
    const mine = await asUser(alice, (tx) =>
      tx.query<{ user_id: string }>("select user_id from public.categories"),
    );
    expect(mine.rows).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(mine.rows.every((row) => row.user_id === alice)).toBe(true);
  });

  it("stops another user renaming or deleting a category", async () => {
    const aliceCategory = await categoryOf(alice, "income");
    const renamed = await asUser(bob, (tx) =>
      tx.query("update public.categories set name = 'ถูกแก้' where id = $1", [aliceCategory]),
    );
    const deleted = await asUser(bob, (tx) =>
      tx.query("delete from public.categories where id = $1", [aliceCategory]),
    );
    expect(renamed.affectedRows).toBe(0);
    expect(deleted.affectedRows).toBe(0);
  });

  it("lets a user read and rename only their own profile", async () => {
    const visible = await asUser(alice, (tx) =>
      tx.query<{ id: string }>("select id from public.profiles"),
    );
    expect(visible.rows.map((row) => row.id)).toEqual([alice]);

    const own = await asUser(alice, (tx) =>
      tx.query("update public.profiles set display_name = 'ชื่อใหม่' where id = $1", [alice]),
    );
    const other = await asUser(alice, (tx) =>
      tx.query("update public.profiles set display_name = 'แอบแก้' where id = $1", [bob]),
    );
    expect(own.affectedRows).toBe(1);
    expect(other.affectedRows).toBe(0);
  });

  it("does not let users create or delete profiles directly", async () => {
    await expect(
      asUser(alice, (tx) => tx.query("delete from public.profiles where id = $1", [alice])),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(alice, (tx) =>
        tx.query("insert into public.profiles (id, display_name) values (gen_random_uuid(), 'x')"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("constraints", () => {
  it.each([
    ["zero amount", { amount: 0 }, /amount_satang/],
    ["negative amount", { amount: -500 }, /amount_satang/],
    ["amount above the maximum", { amount: "1000000000000" }, /amount_satang/],
    ["blank description", { description: "   " }, /description/],
    ["over-long description", { description: "ก".repeat(201) }, /description/],
    ["date before 2000", { date: "1999-12-31" }, /transaction_date/],
    ["unknown type", { type: "transfer" }, /type/],
  ])("rejects a transaction with %s", async (_label, overrides, message) => {
    const categoryId = await categoryOf(alice, "expense");
    await expect(addTransaction(alice, { categoryId, ...overrides })).rejects.toThrow(message);
  });

  it("stores the largest allowed amount exactly", async () => {
    const id = await addTransaction(alice, { amount: "999999999999" });
    const row = await db.query<{ amount_satang: unknown }>(
      "select amount_satang from public.transactions where id = $1",
      [id],
    );
    expect(String(row.rows[0].amount_satang)).toBe("999999999999");
    await db.query("delete from public.transactions where id = $1", [id]);
  });

  it("rejects a transaction whose type differs from its category's type", async () => {
    const incomeCategory = await categoryOf(alice, "income");
    await expect(
      addTransaction(alice, { type: "expense", categoryId: incomeCategory }),
    ).rejects.toThrow(/transactions_category_fkey/);
  });

  it("rejects duplicate category names regardless of case and spacing", async () => {
    await asUser(alice, (tx) =>
      tx.query(
        "insert into public.categories (name, type, color) values ('Cloud Tools', 'expense', 'pine')",
      ),
    );
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "insert into public.categories (name, type, color) values ('  cloud tools ', 'expense', 'clay')",
        ),
      ),
    ).rejects.toThrow(/categories_user_type_name_key/);
    // The same name is fine for the other type, and for another user.
    await asUser(alice, (tx) =>
      tx.query(
        "insert into public.categories (name, type, color) values ('Cloud Tools', 'income', 'pine')",
      ),
    );
    await asUser(bob, (tx) =>
      tx.query(
        "insert into public.categories (name, type, color) values ('Cloud Tools', 'expense', 'pine')",
      ),
    );
  });

  it("rejects a colour outside the palette and a blank name", async () => {
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "insert into public.categories (name, type, color) values ('x', 'expense', '#ff0000')",
        ),
      ),
    ).rejects.toThrow(/color/);
    await expect(
      asUser(alice, (tx) =>
        tx.query(
          "insert into public.categories (name, type, color) values ('  ', 'expense', 'clay')",
        ),
      ),
    ).rejects.toThrow(/name/);
  });
});

describe("referential integrity", () => {
  it("refuses to delete a category that transactions still use, and allows it once unused", async () => {
    const created = await asUser(bob, (tx) =>
      tx.query<{ id: string }>(
        "insert into public.categories (name, type, color) values ('ชั่วคราว', 'expense', 'rose') returning id",
      ),
    );
    const categoryId = created.rows[0].id;
    const transactionId = await addTransaction(bob, { categoryId });

    await expect(
      asUser(bob, (tx) => tx.query("delete from public.categories where id = $1", [categoryId])),
    ).rejects.toThrow(/transactions_category_fkey/);

    await asUser(bob, (tx) =>
      tx.query("delete from public.transactions where id = $1", [transactionId]),
    );
    const deleted = await asUser(bob, (tx) =>
      tx.query("delete from public.categories where id = $1", [categoryId]),
    );
    expect(deleted.affectedRows).toBe(1);
  });

  it("updates updated_at when a transaction changes", async () => {
    const id = await addTransaction(bob);
    await db.query(
      "update public.transactions set updated_at = '2020-01-01', created_at = '2020-01-01' where id = $1",
      [id],
    );
    await asUser(bob, (tx) =>
      tx.query("update public.transactions set description = 'แก้ไขแล้ว' where id = $1", [id]),
    );
    const row = await db.query<{ fresh: boolean; created_kept: boolean }>(
      `select updated_at > now() - interval '1 minute' as fresh,
              created_at = '2020-01-01'::timestamptz as created_kept
       from public.transactions where id = $1`,
      [id],
    );
    expect(row.rows[0]).toEqual({ fresh: true, created_kept: true });
  });

  it("removes everything a user owns when the account is deleted", async () => {
    const frank = await createUser("frank@example.test");
    await addTransaction(frank);
    await addTransaction(frank, { type: "income", amount: 500000 });

    await db.query("delete from auth.users where id = $1", [frank]);

    const left = await db.query<{ count: number }>(
      `select (select count(*) from public.profiles where id = $1)
            + (select count(*) from public.categories where user_id = $1)
            + (select count(*) from public.transactions where user_id = $1) as count`,
      [frank],
    );
    expect(Number(left.rows[0].count)).toBe(0);
  });
});

describe("manual RLS check script (supabase/tests/rls_isolation_check.sql)", () => {
  const script = readFileSync(
    fileURLToPath(new URL("../../supabase/tests/rls_isolation_check.sql", import.meta.url)),
    "utf8",
  )
    .replace("user-a@example.com", "alice@example.test")
    .replace("user-b@example.com", "bob@example.test");

  const leftovers = async () =>
    Number(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from public.transactions where description like 'RLS isolation check%'",
        )
      ).rows[0].count,
    );

  it("passes on the real schema and leaves no data behind", async () => {
    const results = await db.exec(script);
    expect(results.at(-1)?.rows).toEqual([{ result: "PASS: 10 of 10 RLS isolation checks" }]);
    expect(await leftovers()).toBe(0);
  });

  it("stops with a clear error when the users are missing", async () => {
    await expect(
      db.exec(script.replace("alice@example.test", "nobody@example.test")),
    ).rejects.toThrow(/both test users must exist/);
  });

  it("fails, and rolls itself back, when Row Level Security is switched off", async () => {
    await db.transaction(async (tx) => {
      await tx.exec("alter table public.transactions disable row level security");
      await expect(tx.exec(script)).rejects.toThrow(/Check 2 failed/);
      await tx.rollback();
    });
    expect(await leftovers()).toBe(0);
    const stillOn = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where oid = 'public.transactions'::regclass",
    );
    expect(stillOn.rows[0].relrowsecurity).toBe(true);
  });
});
