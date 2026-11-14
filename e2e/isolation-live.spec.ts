import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Data isolation checked the way an attacker would try it: by calling the
 * Supabase REST API directly, with no application code in between. Whatever
 * these requests are allowed to do is decided by PostgreSQL alone (grants and
 * Row Level Security).
 *
 * Like e2e/auth-live.spec.ts this runs only against a dedicated TEST project
 * (E2E_CONFIRM_TEST_PROJECT=yes). The third test also needs a second throwaway
 * account: E2E_USER2_EMAIL and E2E_USER2_PASSWORD. It creates one row as the
 * first user and always deletes it again. Tokens are never written to output.
 */

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
const userA = { email: process.env.E2E_USER_EMAIL, password: process.env.E2E_USER_PASSWORD };
const userB = { email: process.env.E2E_USER2_EMAIL, password: process.env.E2E_USER2_PASSWORD };

const hasProject = Boolean(
  url && key && userA.email && userA.password && process.env.E2E_CONFIRM_TEST_PROJECT === "yes",
);
const hasSecondUser = Boolean(hasProject && userB.email && userB.password);

const TABLES = [
  { name: "transactions", owner: "user_id" },
  { name: "categories", owner: "user_id" },
  { name: "profiles", owner: "id" },
] as const;

interface Session {
  id: string;
  headers: Record<string, string>;
}

async function signIn(
  request: APIRequestContext,
  user: { email?: string; password?: string },
): Promise<Session> {
  const response = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key },
    data: { email: user.email, password: user.password },
  });
  expect(response.status(), "sign-in").toBe(200);
  const body = (await response.json()) as { access_token: string; user: { id: string } };
  return {
    id: body.user.id,
    headers: { apikey: key, Authorization: `Bearer ${body.access_token}` },
  };
}

async function firstExpenseCategory(request: APIRequestContext, session: Session): Promise<string> {
  const response = await request.get(
    `${url}/rest/v1/categories?select=id&type=eq.expense&order=name&limit=1`,
    { headers: session.headers },
  );
  expect(response.status(), "load a category").toBe(200);
  const rows = (await response.json()) as Array<{ id: string }>;
  expect(rows, "the test user has default categories").toHaveLength(1);
  return rows[0].id;
}

const today = () => new Date().toISOString().slice(0, 10);

test.describe("data isolation through the Supabase API", () => {
  test.skip(
    !hasProject,
    "Needs a Supabase TEST project, E2E_USER_* and E2E_CONFIRM_TEST_PROJECT=yes (see README, Testing).",
  );

  test("a request without a session is refused on every table", async ({ request }) => {
    for (const table of TABLES) {
      const response = await request.get(`${url}/rest/v1/${table.name}?select=*&limit=1`, {
        headers: { apikey: key },
      });
      expect([401, 403], `${table.name}: read status`).toContain(response.status());
      expect((await response.json()).code, `${table.name}: error code`).toBe("42501");
    }

    const write = await request.delete(`${url}/rest/v1/transactions?id=eq.${randomUUID()}`, {
      headers: { apikey: key },
    });
    expect([401, 403], "delete without a session").toContain(write.status());
  });

  test("a signed-in user receives only their own rows and cannot forge ownership", async ({
    request,
  }) => {
    const a = await signIn(request, userA);

    for (const table of TABLES) {
      const response = await request.get(`${url}/rest/v1/${table.name}?select=${table.owner}`, {
        headers: a.headers,
      });
      expect(response.status(), `${table.name}: read status`).toBe(200);
      const rows = (await response.json()) as Array<Record<string, string>>;
      const foreign = rows.filter((row) => row[table.owner] !== a.id).length;
      expect(foreign, `${table.name}: rows that belong to someone else`).toBe(0);
      if (table.name !== "transactions") {
        expect(rows.length, `${table.name}: own rows`).toBeGreaterThan(0);
      }
    }

    const forged = await request.post(`${url}/rest/v1/transactions`, {
      headers: a.headers,
      data: {
        user_id: randomUUID(),
        category_id: await firstExpenseCategory(request, a),
        type: "expense",
        amount_satang: 100,
        description: "forged ownership (must be rejected)",
        transaction_date: today(),
      },
    });
    expect(forged.status(), "insert in another user's name").toBe(403);
    expect((await forged.json()).code).toBe("42501");
  });

  test("a second user cannot read, change, delete or reuse the first user's data", async ({
    request,
  }) => {
    test.skip(!hasSecondUser, "Needs a second test user: E2E_USER2_EMAIL and E2E_USER2_PASSWORD.");

    const a = await signIn(request, userA);
    const b = await signIn(request, userB);
    expect(b.id, "the two test users are different accounts").not.toBe(a.id);

    const categoryA = await firstExpenseCategory(request, a);
    const representation = { Prefer: "return=representation" };

    const created = await request.post(`${url}/rest/v1/transactions`, {
      headers: { ...a.headers, ...representation },
      data: {
        category_id: categoryA,
        type: "expense",
        amount_satang: 12345,
        description: `API isolation check ${Date.now()} (safe to delete)`,
        transaction_date: today(),
      },
    });
    expect(created.status(), "user A creates a row").toBe(201);
    const [{ id }] = (await created.json()) as Array<{ id: string }>;
    const row = `${url}/rest/v1/transactions?id=eq.${id}`;

    try {
      const read = await request.get(`${row}&select=id`, { headers: b.headers });
      expect(read.status()).toBe(200);
      expect(await read.json(), "user B reads user A's row").toEqual([]);

      const update = await request.patch(row, {
        headers: { ...b.headers, ...representation },
        data: { amount_satang: 1 },
      });
      expect(await update.json(), "user B updates user A's row").toEqual([]);

      const remove = await request.delete(row, { headers: { ...b.headers, ...representation } });
      expect(await remove.json(), "user B deletes user A's row").toEqual([]);

      const borrowed = await request.post(`${url}/rest/v1/transactions`, {
        headers: b.headers,
        data: {
          category_id: categoryA,
          type: "expense",
          amount_satang: 100,
          description: "borrowed category (must be rejected)",
          transaction_date: today(),
        },
      });
      expect(borrowed.status(), "user B uses user A's category").toBe(409);
      expect((await borrowed.json()).code).toBe("23503");

      for (const table of TABLES) {
        const peek = await request.get(
          `${url}/rest/v1/${table.name}?select=${table.owner}&${table.owner}=eq.${a.id}`,
          { headers: b.headers },
        );
        expect(await peek.json(), `user B lists user A's ${table.name}`).toEqual([]);
      }

      const intact = await request.get(`${row}&select=amount_satang`, { headers: a.headers });
      expect(await intact.json(), "user A's row is unchanged").toEqual([{ amount_satang: 12345 }]);
    } finally {
      await request.delete(row, { headers: a.headers });
    }

    const gone = await request.get(`${row}&select=id`, { headers: a.headers });
    expect(await gone.json(), "the check row was cleaned up").toEqual([]);
  });
});
