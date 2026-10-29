-- Veckoverket MVP. Run in the Supabase SQL editor or `supabase db push`.
-- The current adapter persists one atomic, versioned document per authenticated user.
-- Domain tables below prepare a relational adapter without changing the planning engine.
begin;
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  timezone text not null default 'Europe/Stockholm',
  created_at timestamptz not null default now()
);
create table public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'version' = '1'),
  updated_at timestamptz not null default now()
);
create table public.life_areas (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  target_minutes integer not null default 0 check (target_minutes >= 0),
  priority integer not null default 3 check (priority between 1 and 5),
  min_block_minutes integer not null default 30 check (min_block_minutes > 0),
  allow_split boolean not null default true,
  movable boolean not null default true,
  primary key (user_id, id)
);
create table public.goals (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  life_area_id text not null,
  title text not null,
  description text not null default '',
  horizon text not null check (horizon in ('week', 'long')),
  week_start date not null check (extract(isodow from week_start) = 1),
  primary key (user_id, id),
  foreign key (user_id, life_area_id) references public.life_areas(user_id,id)
);
create table public.tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  goal_id text not null,
  title text not null,
  done boolean not null default false,
  primary key (user_id,id),
  foreign key (user_id,goal_id) references public.goals(user_id,id) on delete cascade
);
create table public.recurring_activities (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  life_area_id text not null,
  weekdays integer[] not null check (weekdays <@ array[0,1,2,3,4,5,6]),
  starts_on date not null,
  template jsonb not null check (jsonb_typeof(template) = 'object'),
  primary key (user_id,id),
  foreign key (user_id,life_area_id) references public.life_areas(user_id,id)
);
create table public.scheduled_activities (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  life_area_id text not null,
  goal_id text,
  recurrence_id text,
  local_date date not null,
  start_minute integer not null check (start_minute >= 0 and start_minute < 1440),
  end_minute integer not null check (end_minute > start_minute and end_minute <= 1440),
  title text not null,
  description text not null default '',
  estimated_minutes integer not null check (estimated_minutes > 0),
  block_type text not null check (block_type in ('locked','protected','flexible')),
  priority integer not null default 3 check (priority between 1 and 5),
  status text not null default 'planned' check (status in ('planned','done','skipped')),
  source text not null check (source in ('manual','recurring','generated')),
  primary key (user_id,id),
  foreign key (user_id,life_area_id) references public.life_areas(user_id,id),
  foreign key (user_id,goal_id) references public.goals(user_id,id),
  foreign key (user_id,recurrence_id) references public.recurring_activities(user_id,id)
);
create table public.planning_rules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rules jsonb not null check (jsonb_typeof(rules) = 'object')
);
create table public.weekly_reflections (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  good text not null default '',
  unfinished text not null default '',
  balance text not null default '',
  next_week text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id,week_start)
);
-- No anonymous access. Composite foreign keys prevent cross-user references.
do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','life_areas','goals','tasks','recurring_activities','scheduled_activities','planning_rules','weekly_reflections'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy own_rows on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
create index scheduled_activities_week on public.scheduled_activities(user_id,local_date);
create index goals_week on public.goals(user_id,week_start);
commit;
