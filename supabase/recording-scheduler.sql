-- Run through scripts/deploy-recording.mjs after both functions are deployed.
-- Values are supplied securely by that script; never put real tokens in Git.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
do $$ declare existing uuid; begin
  select id into existing from vault.secrets where name='veckoverket_recording_worker_token';
  if existing is null then perform vault.create_secret('__WORKER_TOKEN__','veckoverket_recording_worker_token');
  else perform vault.update_secret(existing,'__WORKER_TOKEN__'); end if;
end $$;
insert into public.recording_worker_config(singleton,project_url) values(true,'__PROJECT_URL__') on conflict(singleton) do update set project_url=excluded.project_url;
create or replace function public.dispatch_recording_worker()
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare secret text; project text; request_id bigint;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name='veckoverket_recording_worker_token';
  select project_url into project from public.recording_worker_config where singleton;
  if secret is null or project is null then return null; end if;
  select net.http_post(url:=project||'/functions/v1/recording-worker',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=120000) into request_id;
  return request_id;
end $$;
revoke all on function public.dispatch_recording_worker() from public,anon,authenticated;
grant execute on function public.dispatch_recording_worker() to service_role;
create or replace function public.wake_recording_worker()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.state='queued' and new.available_at<=now() and (tg_op='INSERT' or old.state is distinct from new.state or old.available_at is distinct from new.available_at) then
    perform public.dispatch_recording_worker();
  end if;
  return new;
end $$;
revoke all on function public.wake_recording_worker() from public,anon,authenticated;
drop trigger if exists recording_job_wakeup on public.recording_jobs;
create trigger recording_job_wakeup after insert or update on public.recording_jobs for each row execute function public.wake_recording_worker();
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname='veckoverket-recording-worker';
  perform cron.schedule('veckoverket-recording-worker','* * * * *','select public.dispatch_recording_worker()');
end $$;
commit;
