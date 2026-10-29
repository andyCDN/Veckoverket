-- Run this file in Supabase SQL Editor for a new project or an existing MVP.
-- It is self-contained and safe to run again. Existing workspace data is retained.
begin;
create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'version' = '1'),
  updated_at timestamptz not null default now()
);
alter table public.workspaces add column if not exists revision bigint not null default 1 check (revision > 0);
alter table public.workspaces enable row level security;
drop policy if exists own_rows on public.workspaces;
create policy own_rows on public.workspaces for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.workspaces from anon;
grant select, insert, update, delete on public.workspaces to authenticated;

create or replace function public.bump_workspace_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
drop trigger if exists workspace_revision on public.workspaces;
create trigger workspace_revision before update on public.workspaces
  for each row execute function public.bump_workspace_revision();

-- The user ID is bound to the sync session as well as the current JWT. A request
-- started by account A cannot write A's document after switching to account B.
create or replace function public.save_workspace(
  workspace_user_id uuid,
  workspace_data jsonb,
  expected_revision bigint
) returns table(data jsonb, revision bigint, updated_at timestamptz)
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null or auth.uid() is distinct from workspace_user_id then
    raise exception 'Authentication does not match workspace owner' using errcode = '42501';
  end if;
  if workspace_data is null or jsonb_typeof(workspace_data) <> 'object'
    or workspace_data->>'version' is distinct from '1' or expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid workspace document or revision' using errcode = '22023';
  end if;
  if expected_revision = 0 then
    return query insert into public.workspaces as w (user_id, data)
      values (workspace_user_id, workspace_data)
      on conflict (user_id) do nothing
      returning w.data, w.revision, w.updated_at;
  else
    return query update public.workspaces as w set data = workspace_data
      where w.user_id = workspace_user_id and w.revision = expected_revision
      returning w.data, w.revision, w.updated_at;
  end if;
  if not found then
    raise exception 'Workspace changed on another device' using errcode = '40001';
  end if;
end;
$$;
revoke all on function public.save_workspace(uuid,jsonb,bigint) from public, anon;
grant execute on function public.save_workspace(uuid,jsonb,bigint) to authenticated;
revoke all on function public.bump_workspace_revision() from public, anon;
commit;
