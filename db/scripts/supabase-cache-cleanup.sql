-- Pages CMS cache cleanup job for Supabase pg_cron.
--
-- What this does:
-- - deletes expired rows from cache_file
-- - deletes expired rows from cache_permission
-- - returns simple counts for manual runs
--
-- Why this exists:
-- - Vercel cron jobs are a poor fit for large DB cleanup work
-- - Supabase pg_cron runs inside Postgres and avoids app-level timeouts
--
-- Default TTLs used here:
-- - cache_file: 7 days
-- - cache_permission: 1 hour
--
-- Create/update the function:
--
--   create or replace function public.cleanup_pages_cms_cache()
--   returns json
--   language plpgsql
--   as $$ ... $$;
--
-- Run it manually:
--
--   select public.cleanup_pages_cms_cache();
--
-- Schedule it daily with pg_cron:
--
--   select cron.schedule(
--     'pages-cms-cache-cleanup',
--     '0 0 * * *',
--     $$ select public.cleanup_pages_cms_cache(); $$
--   );
--
-- Inspect scheduled jobs:
--
--   select jobid, jobname, schedule, active
--   from cron.job
--   order by jobid desc;
--
-- Inspect run history:
--
--   select jobid, status, return_message, start_time, end_time
--   from cron.job_run_details
--   where jobid = (
--     select jobid
--     from cron.job
--     where jobname = 'pages-cms-cache-cleanup'
--   )
--   order by start_time desc
--   limit 20;
--
-- Remove the job later:
--
--   select cron.unschedule('pages-cms-cache-cleanup');

create or replace function public.cleanup_pages_cms_cache()
returns json
language plpgsql
as $$
declare
  file_ttl interval := interval '7 days';
  permission_ttl interval := interval '1 hour';
  deleted_files integer := 0;
  deleted_permissions integer := 0;
begin
  delete from cache_file
  where last_updated < now() - file_ttl;

  get diagnostics deleted_files = row_count;

  delete from cache_permission
  where last_updated < now() - permission_ttl;

  get diagnostics deleted_permissions = row_count;

  return json_build_object(
    'deleted_files', deleted_files,
    'deleted_permissions', deleted_permissions,
    'ran_at', now()
  );
end;
$$;
