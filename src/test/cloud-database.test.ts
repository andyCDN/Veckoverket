import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createData } from "../lib/defaults";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222";
let db: PGlite, migration: string;
async function as(user: string | null) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ?? "",
  ]);
  await db.exec(user ? "set role authenticated" : "set role anon");
}
async function save(user: string, revision: number, data = createData()) {
  return db.query<{ data: unknown; revision: number; updated_at: Date }>(
    "select * from public.save_workspace($1::uuid,$2::jsonb,$3::bigint)",
    [user, JSON.stringify(data), revision],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  migration = await readFile(
    new URL(
      "../../supabase/migrations/202610290002_workspace_sync.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${a}'),('${b}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
    create table public.workspaces(user_id uuid primary key references auth.users(id), data jsonb not null,updated_at timestamptz not null default now());
  `);
  await db.query(
    "insert into public.workspaces(user_id,data) values($1,$2::jsonb)",
    [a, JSON.stringify(createData())],
  );
  await db.exec(migration);
  const preserved = await db.query<{ revision: number }>(
    "select revision from public.workspaces",
  );
  expect(preserved.rows).toEqual([{ revision: 1 }]);
}, 30000);
beforeEach(async () => {
  await db.exec("reset role; delete from public.workspaces;");
  await db.query(
    "insert into public.workspaces(user_id,data,updated_at) values($1,$3::jsonb,'2000-01-01'),($2,$3::jsonb,'2000-01-01')",
    [a, b, JSON.stringify(createData())],
  );
});
afterEach(async () => {
  await db.exec("reset role");
});
afterAll(async () => {
  await db?.close();
});

describe("PostgreSQL: molndokument, RLS och atomisk revisionskontroll", () => {
  it("visar endast kontots egna rader och nekas för anonyma användare", async () => {
    await as(a);
    expect(
      (
        await db.query<{ user_id: string }>(
          "select user_id from public.workspaces",
        )
      ).rows,
    ).toEqual([{ user_id: a }]);
    await as(b);
    expect(
      (
        await db.query<{ user_id: string }>(
          "select user_id from public.workspaces",
        )
      ).rows,
    ).toEqual([{ user_id: b }]);
    await as(null);
    await expect(
      db.query("select * from public.workspaces"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(save(a, 1)).rejects.toMatchObject({ code: "42501" });
  });
  it("nekas om sessionens användare och sparningens konto skiljer sig åt", async () => {
    await as(b);
    await expect(save(a, 1)).rejects.toMatchObject({ code: "42501" });
    expect(
      (
        await db.query(
          "update public.workspaces set data=data where user_id=$1 returning user_id",
          [a],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.query<{ revision: number }>(
          "select revision from public.workspaces",
        )
      ).rows,
    ).toEqual([{ revision: 1 }]);
  });
  it("ökar revisionen på servern och stoppar en andra skrivning med samma gamla revision", async () => {
    await as(a);
    const first = createData();
    first.profile.name = "Första enheten";
    const saved = await save(a, 1, first);
    expect(saved.rows[0].revision).toBe(2);
    expect(new Date(saved.rows[0].updated_at).getUTCFullYear()).toBeGreaterThan(
      2000,
    );
    const stale = createData();
    stale.profile.name = "Föråldrad enhet";
    await expect(save(a, 1, stale)).rejects.toMatchObject({ code: "40001" });
    expect(
      (await db.query<{ data: unknown }>("select data from public.workspaces"))
        .rows[0].data,
    ).toEqual(first);
  });
  it("skapar ett tomt kontos första dokument utan att tillåta senare blind överskrivning", async () => {
    await db.query("delete from public.workspaces where user_id=$1", [b]);
    await as(b);
    expect((await save(b, 0)).rows[0].revision).toBe(1);
    await expect(save(b, 0)).rejects.toMatchObject({ code: "40001" });
    await expect(save(b, 999)).rejects.toMatchObject({ code: "40001" });
  });
  it("behåller versionskontrollen även vid direkt uppdatering av en äldre klient", async () => {
    await as(a);
    await db.query(
      "update public.workspaces set revision=100,updated_at='2000-01-01' where user_id=$1",
      [a],
    );
    expect(
      (
        await db.query<{ revision: number }>(
          "select revision from public.workspaces",
        )
      ).rows[0].revision,
    ).toBe(2);
    await expect(save(a, 1)).rejects.toMatchObject({ code: "40001" });
  });
  it("kan köras om och validerar dokumentets version", async () => {
    const before = await db.query(
      "select * from public.workspaces order by user_id",
    );
    await db.exec(migration);
    expect(
      (await db.query("select * from public.workspaces order by user_id")).rows,
    ).toEqual(before.rows);
    await as(a);
    await expect(
      db.query(
        "select * from public.save_workspace($1,'{\"version\":2}'::jsonb,1)",
        [a],
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });
});
