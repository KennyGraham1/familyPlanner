-- Run AFTER schema.sql. This uses Supabase Cron, so it also works with Vercel Hobby.
-- First add these secrets in Supabase Vault (Database > Vault):
-- kinfolk_site_url     https://kinfolk-graham.vercel.app  (no trailing slash)
-- kinfolk_cron_secret  the exact CRON_SECRET from your Vercel environment
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
begin
  if not exists(select 1 from vault.decrypted_secrets where name='kinfolk_site_url') or
     not exists(select 1 from vault.decrypted_secrets where name='kinfolk_cron_secret') then
    raise exception 'Add kinfolk_site_url and kinfolk_cron_secret to Vault first.';
  end if;
end;
$$;
-- Scheduling the same named job again updates it instead of creating duplicates.
select cron.schedule('kinfolk-phone-reminders','* * * * *',$job$
  select net.http_get(
    url := (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='kinfolk_site_url') || '/api/reminders/send',
    headers := jsonb_build_object('Authorization','Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name='kinfolk_cron_secret')),
    timeout_milliseconds := 55000
  );
$job$);
