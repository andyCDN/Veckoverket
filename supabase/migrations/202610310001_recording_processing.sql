-- Additive migration: retain audio, original transcripts, summaries and workspaces.
begin;
alter table public.recording_sessions add column if not exists transcript_revision integer not null default 0;
alter table public.recording_sessions add column if not exists summary_revision integer not null default 0;
alter table public.recording_segments add column if not exists original_transcript text;
alter table public.recording_segments add column if not exists lease_token uuid;
alter table public.recording_segments add column if not exists transcript_revision integer not null default 0;
alter table public.recording_summary_parts add column if not exists transcript_revision integer not null default 0;

create table if not exists public.recording_summary_versions (
  session_id uuid not null,
  user_id uuid not null,
  revision integer not null check(revision>=0),
  summary jsonb not null check(jsonb_typeof(summary)='object'),
  created_at timestamptz not null default now(),
  primary key(session_id,revision),
  foreign key(session_id,user_id) references public.recording_sessions(id,user_id) on delete cascade
);
create table if not exists public.recording_transcript_edits (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null,
  segment_index integer not null,
  revision integer not null check(revision>0),
  before_text text not null,
  after_text text not null check(length(after_text)<=20000),
  created_at timestamptz not null default now(),
  foreign key(session_id,user_id) references public.recording_sessions(id,user_id) on delete cascade
);
create table if not exists public.recording_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null,
  state text not null default 'queued' check(state in('queued','processing','blocked','complete')),
  attempts integer not null default 0 check(attempts>=0),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  lease_token uuid,
  last_error text not null default '' check(length(last_error)<=1000),
  updated_at timestamptz not null default now(),
  unique(session_id,user_id),
  foreign key(session_id,user_id) references public.recording_sessions(id,user_id) on delete cascade
);
create index if not exists recording_jobs_due on public.recording_jobs(state,available_at);
create table if not exists public.recording_worker_config (
  singleton boolean primary key default true check(singleton),
  project_url text not null
);
alter table public.recording_jobs enable row level security;
alter table public.recording_summary_versions enable row level security;
alter table public.recording_transcript_edits enable row level security;
alter table public.recording_worker_config enable row level security;
drop policy if exists recording_jobs_owner on public.recording_jobs;
create policy recording_jobs_owner on public.recording_jobs for select to authenticated using(user_id=auth.uid());
drop policy if exists recording_summary_versions_owner on public.recording_summary_versions;
create policy recording_summary_versions_owner on public.recording_summary_versions for select to authenticated using(user_id=auth.uid());
drop policy if exists recording_transcript_edits_owner on public.recording_transcript_edits;
create policy recording_transcript_edits_owner on public.recording_transcript_edits for select to authenticated using(user_id=auth.uid());
revoke all on public.recording_jobs,public.recording_summary_versions,public.recording_transcript_edits,public.recording_worker_config from public,anon,authenticated;
grant select on public.recording_jobs,public.recording_summary_versions,public.recording_transcript_edits to authenticated;
grant all on public.recording_jobs,public.recording_summary_versions,public.recording_transcript_edits,public.recording_worker_config to service_role;

create or replace function public.enqueue_recording_job(p_user uuid,p_session uuid,p_reset boolean default false)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.recording_jobs(session_id,user_id) values(p_session,p_user)
  on conflict(session_id,user_id) do update set
    state=case when recording_jobs.state='processing' and recording_jobs.lease_until>now() then 'processing'
      when recording_jobs.state='blocked' and not p_reset then 'blocked' else 'queued' end,
    available_at=case when p_reset or recording_jobs.state='complete' then now() else recording_jobs.available_at end,
    attempts=case when p_reset then 0 else recording_jobs.attempts end,
    last_error=case when p_reset then '' else recording_jobs.last_error end,updated_at=now();
end $$;
create or replace function public.claim_recording_job()
returns setof public.recording_jobs language plpgsql security definer set search_path=public,pg_temp as $$
declare chosen uuid;
begin
  select id into chosen from public.recording_jobs where
    (state='queued' and available_at<=now()) or (state='processing' and lease_until<now())
    order by available_at,id for update skip locked limit 1;
  if chosen is null then return; end if;
  return query update public.recording_jobs set state='processing',lease_token=gen_random_uuid(),
    lease_until=now()+interval '180 seconds',updated_at=now() where id=chosen returning *;
end $$;
create or replace function public.finish_recording_job(p_id uuid,p_lease uuid,p_state text,p_error text default '',p_delay integer default 0)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_state not in('queued','blocked','complete') or length(p_error)>1000 or p_delay<0 or p_delay>86400 then raise exception 'Invalid job result'; end if;
  -- A stop or newly acknowledged segment can arrive while the worker holds its lease.
  if p_state='complete' and exists(select 1 from public.recording_jobs j join public.recording_sessions s on s.id=j.session_id and s.user_id=j.user_id where j.id=p_id and s.state<>'complete' and
    (s.state='stopped' or exists(select 1 from public.recording_segments r where r.session_id=s.id and r.user_id=s.user_id and r.state<>'ready'))) then p_state:='queued'; end if;
  update public.recording_jobs set state=p_state,lease_token=null,lease_until=null,
    attempts=case when p_error='' then 0 else attempts+1 end,last_error=p_error,
    available_at=now()+make_interval(secs=>p_delay),updated_at=now()
    where id=p_id and state='processing' and lease_token=p_lease;
  return found;
end $$;
create or replace function public.correct_recording_transcript(p_user uuid,p_session uuid,p_index integer,p_text text,p_expected_revision integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.recording_sessions; old_text text; new_revision integer;
begin
  if p_text is null or length(p_text)>20000 then raise exception 'Invalid transcript'; end if;
  select * into s from public.recording_sessions where id=p_session and user_id=p_user for update;
  if not found or s.state='active' then raise exception 'Recording not editable'; end if;
  if s.transcript_revision<>p_expected_revision then raise exception 'Transcript revision changed' using errcode='40001'; end if;
  select transcript into old_text from public.recording_segments where session_id=p_session and user_id=p_user and segment_index=p_index and state='ready' for update;
  if not found then raise exception 'Transcript missing'; end if;
  if old_text=p_text then return s.transcript_revision; end if;
  new_revision:=s.transcript_revision+1;
  if s.summary is not null then
    insert into public.recording_summary_versions(session_id,user_id,revision,summary) values(p_session,p_user,s.summary_revision,s.summary) on conflict do nothing;
  end if;
  insert into public.recording_transcript_edits(session_id,user_id,segment_index,revision,before_text,after_text) values(p_session,p_user,p_index,new_revision,old_text,p_text);
  update public.recording_segments set original_transcript=coalesce(original_transcript,transcript),transcript=p_text,transcript_revision=new_revision where session_id=p_session and user_id=p_user and segment_index=p_index;
  update public.recording_sessions set transcript_revision=new_revision,state='stopped' where id=p_session and user_id=p_user;
  -- Invalidate any in-flight worker. Its fenced completion cannot replace this job.
  update public.recording_jobs set state='queued',lease_token=null,lease_until=null,available_at=now(),updated_at=now() where session_id=p_session and user_id=p_user and state<>'blocked';
  perform public.enqueue_recording_job(p_user,p_session,false);
  return new_revision;
end $$;
create or replace function public.save_recording_summary_part(p_user uuid,p_session uuid,p_index integer,p_revision integer,p_summary jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare current_revision integer;
begin
  select transcript_revision into current_revision from public.recording_sessions where id=p_session and user_id=p_user for update;
  if not found or current_revision<>p_revision then return false; end if;
  insert into public.recording_summary_parts(session_id,user_id,part_index,summary,transcript_revision) values(p_session,p_user,p_index,p_summary,p_revision)
    on conflict(session_id,part_index) do update set summary=excluded.summary,transcript_revision=excluded.transcript_revision;
  return true;
end $$;
create or replace function public.complete_recording_summary(p_user uuid,p_session uuid,p_revision integer,p_summary jsonb)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.recording_sessions;
begin
  select * into s from public.recording_sessions where id=p_session and user_id=p_user for update;
  if not found or s.transcript_revision<>p_revision or s.state='active' then return false; end if;
  if s.state='complete' and s.summary_revision=p_revision then return true; end if;
  if s.summary is not null then
    insert into public.recording_summary_versions(session_id,user_id,revision,summary) values(p_session,p_user,s.summary_revision,s.summary) on conflict do nothing;
  end if;
  update public.recording_sessions set state='complete',summary=p_summary,summary_revision=p_revision where id=p_session and user_id=p_user;
  insert into public.recording_summary_versions(session_id,user_id,revision,summary) values(p_session,p_user,p_revision,p_summary) on conflict do nothing;
  return true;
end $$;
create or replace function public.recording_capabilities()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare scheduler boolean:=false;
begin
  if to_regclass('cron.job') is not null and to_regclass('vault.secrets') is not null then
    execute 'select exists(select 1 from cron.job where jobname=''veckoverket-recording-worker'' and active) and exists(select 1 from vault.secrets where name=''veckoverket_recording_worker_token'')' into scheduler;
  end if;
  return jsonb_build_object('transcriptEditing',true,'durableQueue',scheduler and exists(select 1 from public.recording_worker_config));
end $$;
revoke all on function public.enqueue_recording_job(uuid,uuid,boolean),public.claim_recording_job(),public.finish_recording_job(uuid,uuid,text,text,integer),public.correct_recording_transcript(uuid,uuid,integer,text,integer),public.save_recording_summary_part(uuid,uuid,integer,integer,jsonb),public.complete_recording_summary(uuid,uuid,integer,jsonb),public.recording_capabilities() from public,anon,authenticated;
grant execute on function public.enqueue_recording_job(uuid,uuid,boolean),public.claim_recording_job(),public.finish_recording_job(uuid,uuid,text,text,integer),public.correct_recording_transcript(uuid,uuid,integer,text,integer),public.save_recording_summary_part(uuid,uuid,integer,integer,jsonb),public.complete_recording_summary(uuid,uuid,integer,jsonb),public.recording_capabilities() to service_role;
commit;
