import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
let db: PGlite, migration: string;
const user = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(
    `create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${user}'); grant usage on schema public to anon,authenticated,service_role;`,
  );
  migration = await readFile(
    new URL(
      "../../supabase/migrations/202610300001_calendar_ical.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
}, 30000);
afterAll(async () => {
  await db?.close();
});
describe("iCal serverlagring", () => {
  it("nekar webbläsarroller tabellåtkomst och hämtfunktion även för det egna kontot", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(
        db.query("select * from public.calendar_ical_feeds"),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query("select public.claim_ical_fetch($1)", [user]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        db.query("delete from public.calendar_ical_feeds where user_id=$1", [
          user,
        ]),
      ).rejects.toMatchObject({ code: "42501" });
      await db.exec("reset role");
    }
  });
  it("begränsar hämtningar atomiskt och bevarar krypterade anslutningar när migrationen körs om", async () => {
    await db.exec("set role service_role");
    expect(
      (await db.query("select public.claim_ical_fetch($1) as claimed", [user]))
        .rows,
    ).toEqual([{ claimed: true }]);
    expect(
      (await db.query("select public.claim_ical_fetch($1) as claimed", [user]))
        .rows,
    ).toEqual([{ claimed: false }]);
    await db.query(
      "update public.calendar_ical_feeds set calendar_id='test@example.test',encrypted_url='v1.iv.ciphertext',name='Kalender' where user_id=$1",
      [user],
    );
    await db.exec("reset role");
    await db.exec(migration);
    expect(
      (
        await db.query(
          "select calendar_id,encrypted_url from public.calendar_ical_feeds",
        )
      ).rows,
    ).toEqual([
      { calendar_id: "test@example.test", encrypted_url: "v1.iv.ciphertext" },
    ]);
    await db.query("delete from auth.users where id=$1", [user]);
    expect(
      (await db.query("select * from public.calendar_ical_feeds")).rows,
    ).toEqual([]);
  });
});
