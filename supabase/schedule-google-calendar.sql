-- Run after google-calendar.sql. Reuses the same Vault secrets as phone reminders.
-- Vault: kinfolk_site_url = https://kinfolk-graham.vercel.app (no trailing slash)
-- Vault: kinfolk_cron_secret = the exact CRON_SECRET configured in Vercel.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='kinfolk_site_url') or
     not exists(select 1 from vault.decrypted_secrets where name='kinfolk_cron_secret') then
    raise exception 'Add kinfolk_site_url and kinfolk_cron_secret to Vault first.';
  end if;
end $$;
select cron.schedule('kinfolk-google-calendar','* * * * *',$job$
  select net.http_get(
    url := (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='kinfolk_site_url') || '/api/google-calendar/sync',
    headers := jsonb_build_object('Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='kinfolk_cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);
