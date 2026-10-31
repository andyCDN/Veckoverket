import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  s = "33333333-3333-4333-8333-333333333333",
  other = "44444444-4444-4444-8444-444444444444";
let db: PGlite;
const summary = {
  agreements: [],
  nextSteps: [],
  uncertainties: ["Tidigare version"],
};
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
    grant usage on schema auth,public,storage to authenticated,anon,service_role;
  `);
  for (const file of [
    "202610300001_recordings.sql",
    "202610310001_recording_processing.sql",
  ]) {
    const sql = await readFile(
      new URL(`../../supabase/migrations/${file}`, import.meta.url),
      "utf8",
    );
    await db.exec(sql);
    await db.exec(sql);
  }
}, 30000);
beforeEach(async () => {
  await db.exec("reset role;delete from public.recording_sessions");
  await db.query(
    "insert into public.recording_sessions(id,user_id,title,context,state,segment_count,summary) values($1,$2,'A','{}','complete',1,$3),($4,$5,'B','{}','active',1,null)",
    [s, a, summary, other, b],
  );
  await db.query(
    "insert into public.recording_segments(session_id,user_id,segment_index,sha256,duration_ms,state,transcript) values($1,$2,0,$3,20000,'ready','Länken skickas på fredag.'),($4,$5,0,$3,20000,'ready','Privat B')",
    [s, a, "a".repeat(64), other, b],
  );
});
afterAll(async () => {
  await db?.close();
});
it("skiljer kö, rättelser och versionshistorik mellan konton och nekar klientskrivningar", async () => {
  await db.query("select public.enqueue_recording_job($1,$2)", [a, s]);
  await db.query("select public.enqueue_recording_job($1,$2)", [b, other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
  await db.exec("set role authenticated");
  expect(
    (await db.query("select session_id from public.recording_jobs")).rows,
  ).toEqual([{ session_id: s }]);
  await expect(
    db.query(
      "select public.correct_recording_transcript($1,$2,0,'Förfalskat',0)",
      [a, s],
    ),
  ).rejects.toThrow(/permission denied/);
  await expect(
    db.exec("update public.recording_jobs set state='complete'"),
  ).rejects.toThrow();
  await expect(
    db.exec("select public.claim_recording_job()"),
  ).rejects.toThrow();
});
it("bevarar originaltext och tidigare sammanfattning vid rättelser och avvisar en föråldrad revision", async () => {
  await db.query(
    "select public.correct_recording_transcript($1,$2,0,'Länken skickas på måndag.',0)",
    [a, s],
  );
  await db.query(
    "select public.correct_recording_transcript($1,$2,0,'Kim skickar länken på måndag.',1)",
    [a, s],
  );
  await expect(
    db.query("select public.correct_recording_transcript($1,$2,0,'Stale',0)", [
      a,
      s,
    ]),
  ).rejects.toThrow(/revision changed/);
  expect(
    (
      await db.query(
        "select original_transcript,transcript,transcript_revision from public.recording_segments where session_id=$1",
        [s],
      )
    ).rows,
  ).toEqual([
    {
      original_transcript: "Länken skickas på fredag.",
      transcript: "Kim skickar länken på måndag.",
      transcript_revision: 2,
    },
  ]);
  const rows = await db.query(
    "select state,summary,summary_revision,transcript_revision from public.recording_sessions where id=$1",
    [s],
  );
  expect(rows.rows[0]).toMatchObject({
    state: "stopped",
    summary,
    summary_revision: 0,
    transcript_revision: 2,
  });
  expect(
    (
      await db.query(
        "select revision from public.recording_summary_versions where session_id=$1",
        [s],
      )
    ).rows,
  ).toEqual([{ revision: 0 }]);
  expect(
    (
      await db.query(
        "select before_text,after_text from public.recording_transcript_edits order by revision",
      )
    ).rows,
  ).toHaveLength(2);
  expect(
    (
      await db.query(
        "select transcript from public.recording_segments where session_id=$1",
        [other],
      )
    ).rows,
  ).toEqual([{ transcript: "Privat B" }]);
});
it("låter inte en gammal AI-analys ersätta en rättad version och behåller båda slutversionerna", async () => {
  await db.query(
    "select public.correct_recording_transcript($1,$2,0,'Rättad text',0)",
    [a, s],
  );
  const old = await db.query(
    "select public.complete_recording_summary($1,$2,0,$3) as saved",
    [a, s, { ...summary, uncertainties: ["Gammal analys"] }],
  );
  expect(old.rows[0]).toEqual({ saved: false });
  expect(
    (
      await db.query(
        "select public.save_recording_summary_part($1,$2,0,0,$3) as saved",
        [a, s, summary],
      )
    ).rows[0],
  ).toEqual({ saved: false });
  const latest = { ...summary, uncertainties: ["Ny analys"] };
  expect(
    (
      await db.query(
        "select public.complete_recording_summary($1,$2,1,$3) as saved",
        [a, s, latest],
      )
    ).rows[0],
  ).toEqual({ saved: true });
  await db.query("select public.complete_recording_summary($1,$2,1,$3)", [
    a,
    s,
    summary,
  ]); // Same revision is immutable.
  expect(
    (
      await db.query(
        "select summary from public.recording_sessions where id=$1",
        [s],
      )
    ).rows[0],
  ).toEqual({ summary: latest });
  expect(
    (
      await db.query(
        "select revision from public.recording_summary_versions where session_id=$1 order by revision",
        [s],
      )
    ).rows,
  ).toEqual([{ revision: 0 }, { revision: 1 }]);
});
it("återtar utgångna jobb, ignorerar gamla låstoken och schemalägger tidsbegränsade återförsök", async () => {
  await db.query("select public.enqueue_recording_job($1,$2)", [a, s]);
  const first = (
    await db.query<any>("select * from public.claim_recording_job()")
  ).rows[0];
  expect(
    (await db.query("select * from public.claim_recording_job()")).rows,
  ).toEqual([]);
  await db.query(
    "update public.recording_jobs set lease_until=now()-interval '1 second' where id=$1",
    [first.id],
  );
  const second = (
    await db.query<any>("select * from public.claim_recording_job()")
  ).rows[0];
  expect(second.lease_token).not.toBe(first.lease_token);
  expect(
    (
      await db.query(
        "select public.finish_recording_job($1,$2,'complete') as saved",
        [first.id, first.lease_token],
      )
    ).rows[0],
  ).toEqual({ saved: false });
  await db.query(
    "select public.finish_recording_job($1,$2,'queued','Tillfälligt fel',60)",
    [second.id, second.lease_token],
  );
  expect(
    (await db.query("select * from public.claim_recording_job()")).rows,
  ).toEqual([]);
  await db.query("select public.enqueue_recording_job($1,$2,true)", [a, s]);
  const third = (
    await db.query<any>("select * from public.claim_recording_job()")
  ).rows[0];
  await db.query(
    "select public.finish_recording_job($1,$2,'blocked','API-kredit saknas',0)",
    [third.id, third.lease_token],
  );
  await db.query("select public.enqueue_recording_job($1,$2)", [a, s]);
  expect(
    (await db.query("select * from public.claim_recording_job()")).rows,
  ).toEqual([]);
});
it("tappar inte ett stopp som kommer medan arbetaren avslutar ett aktivt samtal", async () => {
  await db.query("select public.enqueue_recording_job($1,$2)", [b, other]);
  const job = (
    await db.query<any>("select * from public.claim_recording_job()")
  ).rows[0];
  await db.query(
    "update public.recording_sessions set state='stopped' where id=$1",
    [other],
  );
  await db.query("select public.enqueue_recording_job($1,$2)", [b, other]);
  await db.query("select public.finish_recording_job($1,$2,'complete')", [
    job.id,
    job.lease_token,
  ]);
  expect(
    (await db.query("select state from public.recording_jobs")).rows,
  ).toEqual([{ state: "queued" }]);
});
it("annonserar inte serverbearbetning innan schemaläggaren är installerad", async () => {
  const result = await db.query(
    "select public.recording_capabilities() as features",
  );
  expect(result.rows[0]).toEqual({
    features: { transcriptEditing: true, durableQueue: false },
  });
});
it("installerar schemaläggaren idempotent och väcker kön efter en slutförd del utan en webbläsare", async () => {
  await db.exec(`create schema cron;create schema net;create schema vault;
    create table cron.job(jobid bigserial primary key,jobname text,schedule text,command text,active boolean default true);
    create function cron.schedule(n text,s text,c text) returns bigint language plpgsql as $$ declare i bigint;begin insert into cron.job(jobname,schedule,command) values(n,s,c) returning jobid into i;return i;end $$;
    create function cron.unschedule(i bigint) returns boolean language plpgsql as $$ begin delete from cron.job where jobid=i;return found;end $$;
    create table vault.secrets(id uuid primary key default gen_random_uuid(),name text,secret text);
    create view vault.decrypted_secrets as select name,secret as decrypted_secret from vault.secrets;
    create function vault.create_secret(s text,n text) returns uuid language plpgsql as $$ declare i uuid;begin insert into vault.secrets(name,secret) values(n,s) returning id into i;return i;end $$;
    create function vault.update_secret(i uuid,s text) returns void language sql as $$ update vault.secrets set secret=s where id=i $$;
    create table net.requests(id bigserial primary key,url text,headers jsonb,body jsonb);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$ declare i bigint;begin insert into net.requests(url,headers,body) values(url,headers,body) returning id into i;return i;end $$;
  `);
  const sql = (
    await readFile(
      new URL("../../supabase/recording-scheduler.sql", import.meta.url),
      "utf8",
    )
  )
    .replace(/^create extension.*$/gm, "")
    .replaceAll(
      "__WORKER_TOKEN__",
      "test-worker-token-with-more-than-thirty-two-characters",
    )
    .replaceAll("__PROJECT_URL__", "https://example.supabase.co");
  await db.exec(sql);
  await db.exec(sql);
  expect((await db.query("select jobname from cron.job")).rows).toEqual([
    { jobname: "veckoverket-recording-worker" },
  ]);
  expect(
    (await db.query("select public.recording_capabilities() as features"))
      .rows[0],
  ).toEqual({ features: { transcriptEditing: true, durableQueue: true } });
  await db.query("select public.enqueue_recording_job($1,$2)", [b, other]);
  const job = (
    await db.query<any>("select * from public.claim_recording_job()")
  ).rows[0];
  await db.query("select public.finish_recording_job($1,$2,'queued','',0)", [
    job.id,
    job.lease_token,
  ]);
  expect((await db.query("select url from net.requests")).rows).toEqual([
    { url: "https://example.supabase.co/functions/v1/recording-worker" },
    { url: "https://example.supabase.co/functions/v1/recording-worker" },
  ]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
  await db.exec("set role authenticated");
  await expect(
    db.exec("select public.dispatch_recording_worker()"),
  ).rejects.toThrow(/permission denied/);
});
