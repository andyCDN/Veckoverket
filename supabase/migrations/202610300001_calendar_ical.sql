-- Private feed URLs are encrypted by the Edge Function before storage.
-- Browser roles have no table/RPC access, even to their own row.
begin;
create table if not exists public.calendar_ical_feeds (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calendar_id text,
  name text not null default '',
  encrypted_url text,
  next_fetch_at timestamptz not null default '-infinity',
  updated_at timestamptz not null default now(),
  check (encrypted_url is null or (encrypted_url like 'v1.%' and calendar_id is not null))
);
alter table public.calendar_ical_feeds enable row level security;
revoke all on public.calendar_ical_feeds from public, anon, authenticated;
grant select, insert, update, delete on public.calendar_ical_feeds to service_role;

create or replace function public.claim_ical_fetch(feed_user_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare claimed uuid;
begin
  insert into public.calendar_ical_feeds(user_id, next_fetch_at)
  values (feed_user_id, now() + interval '15 seconds')
  on conflict (user_id) do update set next_fetch_at = now() + interval '15 seconds'
  where public.calendar_ical_feeds.next_fetch_at <= now()
  returning user_id into claimed;
  return claimed is not null;
end;
$$;
revoke all on function public.claim_ical_fetch(uuid) from public, anon, authenticated;
grant execute on function public.claim_ical_fetch(uuid) to service_role;
commit;
