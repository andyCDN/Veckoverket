import { afterAll, beforeAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  s = "33333333-3333-4333-8333-333333333333",
  other = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
async function as(user: string) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec("set role authenticated");
}
beforeAll(async () => {
  db = new PGlite();
  await db.waitReady;
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${a}'),('${b}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,name text not null);
 create function storage.foldername(path text) returns text[] language sql immutable as $$ select string_to_array(path,'/') $$;
 alter table storage.objects enable row level security;
 grant usage on schema auth,public,storage to authenticated,anon,service_role;grant select,insert,update,delete on storage.objects to authenticated;grant select on storage.objects to anon;
 `);
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202610300001_recordings.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
  await db.exec(migration);
  await db.query(
    "insert into public.recording_sessions(id,user_id,title,context) values($1,$2,'A','{}'),($3,$4,'B','{}')",
    [s, a, other, b],
  );
  await db.query(
    "insert into public.recording_segments(session_id,user_id,segment_index,sha256,duration_ms,state,transcript) values($1,$2,0,$3,1000,'ready','Privat A'),($4,$5,0,$3,1000,'ready','Privat B')",
    [s, a, "a".repeat(64), other, b],
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
it("håller ljudfiler privata och begränsade i storlek", async () => {
  await db.exec("reset role");
  const result = await db.query(
    "select public,file_size_limit,allowed_mime_types from storage.buckets where id='interview-recordings'",
  );
  expect(result.rows).toEqual([
    {
      public: false,
      file_size_limit: 3145728,
      allowed_mime_types: ["audio/wav"],
    },
  ]);
});
it("låter användare bara läsa sina egna inspelningar och transkriptioner", async () => {
  await as(a);
  expect(
    (await db.query("select title from public.recording_sessions")).rows,
  ).toEqual([{ title: "A" }]);
  expect(
    (await db.query("select transcript from public.recording_segments")).rows,
  ).toEqual([{ transcript: "Privat A" }]);
  await as(b);
  expect(
    (await db.query("select title from public.recording_sessions")).rows,
  ).toEqual([{ title: "B" }]);
});
it("tillåter inte klienten att förfalska sammanfattningar, status eller transkriptioner", async () => {
  await as(a);
  await expect(
    db.exec(
      "update public.recording_sessions set state='complete' where title='A'",
    ),
  ).rejects.toThrow();
  await expect(
    db.exec("update public.recording_segments set transcript='Förfalskat'"),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into public.recording_summary_parts(session_id,user_id,part_index,summary) values($1,$2,0,'{}')",
      [s, a],
    ),
  ).rejects.toThrow();
});
it("tillåter uppladdning bara till den egna aktiva inspelningen och förhindrar överskrivning", async () => {
  await as(a);
  await db.query(
    "insert into storage.objects(bucket_id,name) values('interview-recordings',$1)",
    [`${a}/${s}/0.wav`],
  );
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('interview-recordings',$1)",
      [`${b}/${other}/0.wav`],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('interview-recordings',$1)",
      [`${a}/${other}/0.wav`],
    ),
  ).rejects.toThrow();
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('interview-recordings',$1)",
      [`${a}/${s}/hack.html`],
    ),
  ).rejects.toThrow();
  const changed = await db.query(
    "update storage.objects set name='changed' returning name",
  );
  expect(changed.rows).toEqual([]);
  await as(b);
  expect((await db.query("select name from storage.objects")).rows).toEqual([]);
  await db.exec("reset role");
  await db.query(
    "update public.recording_sessions set state='complete' where id=$1",
    [s],
  );
  await as(a);
  await expect(
    db.query(
      "insert into storage.objects(bucket_id,name) values('interview-recordings',$1)",
      [`${a}/${s}/1.wav`],
    ),
  ).rejects.toThrow();
});
