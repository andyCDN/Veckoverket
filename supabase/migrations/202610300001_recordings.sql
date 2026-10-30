-- Private segmented recordings. The Edge Function verifies Auth.getUser and
-- performs server-only writes; authenticated users can read only their own rows.
create table if not exists public.recording_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(title) between 1 and 200),
  context jsonb not null check(jsonb_typeof(context)='object'),
  state text not null default 'active' check(state in ('active','stopped','complete')),
  started_at timestamptz not null default now(),
  stopped_at timestamptz,
  segment_count integer not null default 0 check(segment_count between 0 and 100000),
  summary jsonb,
  unique(id,user_id)
);
create table if not exists public.recording_segments (
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  segment_index integer not null check(segment_index between 0 and 99999),
  state text not null default 'pending' check(state in ('pending','processing','ready','error')),
  sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
  duration_ms integer not null check(duration_ms between 1 and 60000),
  lease_until timestamptz,
  transcript text not null default '' check(length(transcript)<=20000),
  primary key(session_id,segment_index),
  foreign key(session_id,user_id) references public.recording_sessions(id,user_id) on delete cascade
);
create table if not exists public.recording_summary_parts (
  session_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  part_index integer not null check(part_index>=0),
  summary jsonb not null check(jsonb_typeof(summary)='object'),
  primary key(session_id,part_index),
  foreign key(session_id,user_id) references public.recording_sessions(id,user_id) on delete cascade
);
alter table public.recording_sessions enable row level security;
alter table public.recording_segments enable row level security;
alter table public.recording_summary_parts enable row level security;
drop policy if exists recording_sessions_owner on public.recording_sessions;
create policy recording_sessions_owner on public.recording_sessions for select to authenticated using(user_id=auth.uid());
drop policy if exists recording_segments_owner on public.recording_segments;
create policy recording_segments_owner on public.recording_segments for select to authenticated using(user_id=auth.uid());
drop policy if exists recording_summary_parts_owner on public.recording_summary_parts;
create policy recording_summary_parts_owner on public.recording_summary_parts for select to authenticated using(user_id=auth.uid());
revoke all on public.recording_sessions,public.recording_segments,public.recording_summary_parts from anon,authenticated;
grant select on public.recording_sessions,public.recording_segments,public.recording_summary_parts to authenticated;
grant all on public.recording_sessions,public.recording_segments,public.recording_summary_parts to service_role;
create index if not exists recording_sessions_user_time on public.recording_sessions(user_id,started_at desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('interview-recordings','interview-recordings',false,3145728,array['audio/wav'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists recording_audio_read on storage.objects;
create policy recording_audio_read on storage.objects for select to authenticated using(
  bucket_id='interview-recordings' and (storage.foldername(name))[1]=auth.uid()::text
);
drop policy if exists recording_audio_upload on storage.objects;
create policy recording_audio_upload on storage.objects for insert to authenticated with check(
  bucket_id='interview-recordings' and (storage.foldername(name))[1]=auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{1,5}\.wav$'
  and exists(select 1 from public.recording_sessions s where s.id::text=(storage.foldername(name))[2] and s.user_id=auth.uid() and s.state='active')
);
-- No public links, anonymous policies or client UPDATE policies are created.
