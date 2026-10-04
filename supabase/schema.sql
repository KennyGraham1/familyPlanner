-- Kinfolk shared family spaces. Run once in a Supabase project's SQL editor.
-- Requires the pg_jsonschema and pgcrypto extensions, available on Supabase.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_jsonschema with schema extensions;

create table if not exists public.planner_households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.planner_memberships (
  household_id uuid not null references public.planner_households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (household_id, user_id),
  unique (user_id)
);
create table if not exists public.planner_invites (
  household_id uuid primary key references public.planner_households(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null
);
-- Safe to run on an existing family: account links are separate from plan data.
-- The backfill runs only when the column is first added. On later runs it could link
-- a new owner (after an ownership transfer) to someone else's profile.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'planner_memberships' and column_name = 'member_id'
  ) then
    alter table public.planner_memberships add column member_id text;
    update public.planner_memberships m
    set member_id = h.data->'settings'->>'currentMemberId'
    from public.planner_households h
    where m.household_id = h.id and m.user_id = h.owner_id;
  end if;
end $$;
create unique index if not exists planner_unique_profile
  on public.planner_memberships(household_id, member_id) where member_id is not null;
alter table public.planner_households enable row level security;
alter table public.planner_memberships enable row level security;
alter table public.planner_invites enable row level security;

create or replace function public.planner_is_member(family_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.planner_memberships where household_id = family_id and user_id = auth.uid());
$$;

drop policy if exists "Read own membership" on public.planner_memberships;
create policy "Read own membership" on public.planner_memberships for select to authenticated using (user_id = auth.uid());
drop policy if exists "Read family plans" on public.planner_households;
create policy "Read family plans" on public.planner_households for select to authenticated using (public.planner_is_member(id));
-- No client read policies for invites and no direct table write privileges.
revoke all on public.planner_households, public.planner_memberships, public.planner_invites from anon, authenticated;
grant select on public.planner_households, public.planner_memberships to authenticated;

create or replace function public.planner_validate_data(document jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare collection text; item jsonb; reference text; member_ids text[];
begin
  if document is null or octet_length(document::text) > 5000000 then return false; end if;
  if not extensions.jsonb_matches_schema(
    $schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"version":{"type":"number","const":1},"settings":{"type":"object","properties":{"familyName":{"type":"string","minLength":1,"maxLength":150},"currentMemberId":{"type":"string","minLength":1,"maxLength":100},"weekStartsMonday":{"type":"boolean"}},"required":["familyName","currentMemberId","weekStartsMonday"],"additionalProperties":false},"members":{"minItems":1,"maxItems":30,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"name":{"type":"string","minLength":1,"maxLength":150},"role":{"type":"string","maxLength":50},"color":{"type":"string","enum":["lavender","sage","peach","blue","rose","yellow"]},"emoji":{"type":"string","maxLength":10}},"required":["id","name","role","color","emoji"],"additionalProperties":false}},"events":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"title":{"type":"string","minLength":1,"maxLength":150},"date":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"start":{"type":"string","pattern":"^([01]\\d|2[0-3]):[0-5]\\d$"},"end":{"type":"string","pattern":"^([01]\\d|2[0-3]):[0-5]\\d$"},"memberIds":{"minItems":1,"type":"array","items":{"type":"string","minLength":1,"maxLength":100}},"location":{"type":"string","maxLength":200},"notes":{"type":"string","maxLength":2000},"repeat":{"type":"string","enum":["none","weekly","fortnightly","monthly","yearly"]},"category":{"type":"string","enum":["Activity","School","Appointment","Family time","Work"]},"endDate":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"until":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"allDay":{"type":"boolean"},"place":{"type":"object","properties":{"lat":{"type":"number","minimum":-90,"maximum":90},"lon":{"type":"number","minimum":-180,"maximum":180}},"required":["lat","lon"],"additionalProperties":false}},"required":["id","title","date","start","end","memberIds","location","notes","repeat","category"],"additionalProperties":false}},"tasks":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"title":{"type":"string","minLength":1,"maxLength":150},"memberId":{"type":"string","minLength":1,"maxLength":100},"due":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"done":{"type":"boolean"},"priority":{"type":"string","enum":["normal","high"]}},"required":["id","title","memberId","due","done","priority"],"additionalProperties":false}},"shopping":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"name":{"type":"string","minLength":1,"maxLength":150},"quantity":{"type":"string","maxLength":50},"category":{"type":"string","enum":["Produce","Dairy & eggs","Meat & fish","Bakery","Pantry","Household","Other"]},"done":{"type":"boolean"}},"required":["id","name","quantity","category","done"],"additionalProperties":false}},"meals":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"date":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"slot":{"type":"string","enum":["Breakfast","Lunch","Dinner"]},"recipeId":{"type":"string","minLength":1,"maxLength":100}},"required":["id","date","slot","recipeId"],"additionalProperties":false}},"notes":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"title":{"type":"string","minLength":1,"maxLength":150},"body":{"type":"string","minLength":1,"maxLength":2000},"memberId":{"type":"string","minLength":1,"maxLength":100},"color":{"type":"string","enum":["lavender","sage","peach","blue","rose","yellow"]},"pinned":{"type":"boolean"},"createdAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"}},"required":["id","title","body","memberId","color","pinned","createdAt"],"additionalProperties":false}}},"required":["version","settings","members","events","tasks","shopping","meals","notes"],"additionalProperties":false}$schema$::json,
    document
  ) then return false; end if;
  select array_agg(m->>'id') into member_ids from jsonb_array_elements(document->'members') m;
  if not ((document->'settings'->>'currentMemberId') = any(member_ids)) then return false; end if;
  if exists(select 1 from jsonb_array_elements(document->'meals') m group by m->>'date', m->>'slot' having count(*) > 1) then return false; end if;
  foreach collection in array array['members','events','tasks','shopping','meals','notes'] loop
    if (select count(*) <> count(distinct e->>'id') from jsonb_array_elements(document->collection) e) then return false; end if;
    for item in select * from jsonb_array_elements(document->collection) loop
      if collection in ('tasks','notes') and not ((item->>'memberId') = any(member_ids)) then return false; end if;
      if collection = 'events' then
        -- Mirrors eventSchema in src/lib/data.ts. Multi-day and all-day events may end at an earlier clock time.
        if coalesce(item->>'endDate', item->>'date') = item->>'date'
          and not coalesce((item->>'allDay')::boolean, false)
          and item->>'end' <= item->>'start' then return false; end if;
        if item ? 'endDate' and (to_char((item->>'endDate')::date,'YYYY-MM-DD') <> item->>'endDate'
          or item->>'endDate' < item->>'date') then return false; end if;
        if item ? 'until' and (to_char((item->>'until')::date,'YYYY-MM-DD') <> item->>'until'
          or item->>'until' < item->>'date') then return false; end if;
        -- A repeating event must end before it repeats.
        if item ? 'endDate' and item->>'repeat' <> 'none'
          and (item->>'endDate')::date - (item->>'date')::date >= (case item->>'repeat'
            when 'weekly' then 7 when 'fortnightly' then 14 when 'monthly' then 28 else 365 end)
          then return false; end if;
        for reference in select jsonb_array_elements_text(item->'memberIds') loop
          if not (reference = any(member_ids)) then return false; end if;
        end loop;
      end if;
      if collection in ('events','meals') and to_char((item->>'date')::date,'YYYY-MM-DD') <> item->>'date' then return false; end if;
      if collection = 'tasks' and to_char((item->>'due')::date,'YYYY-MM-DD') <> item->>'due' then return false; end if;
      if collection = 'meals' and item->>'recipeId' not in ('pasta','tacos','salmon','curry','pizza','pancakes','nigerian-jollof','ghanaian-jollof','red-red','waakye','kelewele','groundnut-soup','tatale','egusi-soup','efo-riro','akara','moi-moi','ewa-riro','chicken-suya','asaro','chicken-yassa','thieboudienne','ndambe','beef-maafe','domoda','vegetable-benachin','kedjenou','attieke-fish','fonio-pilaf','plasas','lentil-bolognese','chicken-traybake','vegetable-couscous','overnight-oats','shakshuka','egg-fried-rice','chicken-stir-fry','crispy-tofu-bowls','minestrone','tomato-bean-soup','three-bean-chilli','beef-chilli','salmon-fishcakes','tuna-pasta-bake','chicken-noodle-soup','mushroom-risotto','spinach-frittata','stuffed-sweet-potatoes','chickpea-wraps','turkey-meatballs','shepherds-pie','vegetable-noodles','teriyaki-salmon','peanut-noodles','breakfast-burritos','apple-porridge','yoghurt-granola-bowls','vegetable-lasagne','chicken-fajitas','lemon-pea-orzo') then return false; end if;
    end loop;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function public.planner_create_family(initial_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare family_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if exists(select 1 from public.planner_memberships where user_id = auth.uid()) then raise exception 'You already belong to a family space.'; end if;
  if not public.planner_validate_data(initial_data) then raise exception 'The family data is not valid.'; end if;
  insert into public.planner_households(owner_id,data) values(auth.uid(),initial_data) returning id into family_id;
  insert into public.planner_memberships(household_id,user_id,member_id)
    values(family_id,auth.uid(),initial_data->'settings'->>'currentMemberId');
  return family_id;
end;
$$;

create or replace function public.planner_apply_changes(family_id uuid, changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare document jsonb; change jsonb; collection text; action text; items jsonb; record_id text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if jsonb_typeof(changes) is distinct from 'array' or octet_length(changes::text) > 5000000 then raise exception 'Invalid changes.'; end if;
  if jsonb_array_length(changes) > 1000 then raise exception 'Please save fewer changes at once.'; end if;
  -- Lock the latest document before applying changes. Concurrent clients cannot overwrite unrelated changes.
  select h.data into document from public.planner_households h where h.id = family_id for update;
  if not public.planner_is_member(family_id) then raise exception 'This family space is private.'; end if;
  for change in select * from jsonb_array_elements(changes) loop
    collection := change->>'collection'; action := change->>'action';
    if collection is null or action is null then raise exception 'Invalid change.'; end if;
    if collection = 'settings' and action = 'settings' then
      document := jsonb_set(document,'{settings}',change->'value');
    elsif collection in ('members','events','tasks','shopping','meals','notes') and action in ('upsert','remove') then
      if action = 'upsert' then record_id := change->'value'->>'id'; else record_id := change->>'id'; end if;
      if record_id is null or length(record_id) < 1 then raise exception 'An item ID is required.'; end if;
      select coalesce(jsonb_agg(e order by ord),'[]'::jsonb) into items
        from jsonb_array_elements(document->collection) with ordinality as entry(e,ord)
        where e->>'id' <> record_id;
      if action = 'upsert' then
        -- A date and meal slot have one plan, even if two clients plan it concurrently.
        if collection = 'meals' then
          select coalesce(jsonb_agg(e),'[]'::jsonb) into items from jsonb_array_elements(items) e
            where not (e->>'date' = change->'value'->>'date' and e->>'slot' = change->'value'->>'slot');
        end if;
        items := items || jsonb_build_array(change->'value');
      end if;
      document := jsonb_set(document,array[collection],items);
    else raise exception 'Unknown change.';
    end if;
  end loop;
  if not public.planner_validate_data(document) then raise exception 'The updated family data is not valid.'; end if;
  update public.planner_households set data = document, updated_at = clock_timestamp() where id = family_id;
  return document;
end;
$$;

create or replace function public.planner_create_invite(family_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  perform 1 from public.planner_households h where h.id = family_id for update;
  if auth.uid() is null or not exists(select 1 from public.planner_households where id = family_id and owner_id = auth.uid()) then
    raise exception 'Only the person who created this family space can invite people.';
  end if;
  token := encode(extensions.gen_random_bytes(24),'hex');
  insert into public.planner_invites(household_id,token_hash,expires_at)
    values(family_id,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '7 days')
    on conflict(household_id) do update set token_hash = excluded.token_hash, expires_at = excluded.expires_at;
  return token;
end;
$$;

create or replace function public.planner_join_family(invite_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare family_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if invite_token is null or length(invite_token) <> 48 then raise exception 'This invite is invalid or has expired.'; end if;
  if exists(select 1 from public.planner_memberships where user_id = auth.uid()) then raise exception 'You already belong to a family space.'; end if;
  select i.household_id into family_id from public.planner_invites i
    where i.token_hash = encode(extensions.digest(invite_token,'sha256'),'hex') and i.expires_at > now();
  if family_id is null then raise exception 'This invite is invalid or has expired.'; end if;
  -- Serialise joining with removal/revocation, then recheck the invite under the lock.
  perform 1 from public.planner_households h where h.id = family_id for update;
  if not exists(select 1 from public.planner_invites i where i.household_id = family_id
    and i.token_hash = encode(extensions.digest(invite_token,'sha256'),'hex')
    and i.expires_at > now()) then raise exception 'This invite is invalid or has expired.'; end if;
  insert into public.planner_memberships(household_id,user_id) values(family_id,auth.uid());
  return family_id;
end;
$$;

revoke all on function public.planner_is_member(uuid) from public, anon;
revoke all on function public.planner_validate_data(jsonb) from public, anon, authenticated;
revoke all on function public.planner_create_family(jsonb) from public, anon;
revoke all on function public.planner_apply_changes(uuid,jsonb) from public, anon;
revoke all on function public.planner_create_invite(uuid) from public, anon;
revoke all on function public.planner_join_family(text) from public, anon;
grant execute on function public.planner_is_member(uuid) to authenticated;
grant execute on function public.planner_create_family(jsonb) to authenticated;
grant execute on function public.planner_apply_changes(uuid,jsonb) to authenticated;
grant execute on function public.planner_create_invite(uuid) to authenticated;
grant execute on function public.planner_join_family(text) to authenticated;
-- A single snapshot gives each account its own profile and access information.
create or replace function public.planner_get_context()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'household_id',h.id,'owner_id',h.owner_id,'member_id',m.member_id,
    'data',h.data,'updated_at',h.updated_at,
    'access',(select coalesce(jsonb_agg(jsonb_build_object(
      'user_id',a.user_id,'member_id',a.member_id,
      'name',coalesce((select p->>'name' from jsonb_array_elements(h.data->'members') p
        where p->>'id'=a.member_id),'Profile not chosen'),
      'is_owner',a.user_id=h.owner_id)), '[]'::jsonb)
      from public.planner_memberships a where a.household_id=h.id))
  from public.planner_memberships m join public.planner_households h on h.id=m.household_id
  where m.user_id=auth.uid();
$$;

create or replace function public.planner_choose_profile(family_id uuid, profile_id text, display_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare document jsonb; chosen text;
begin
  select h.data into document from public.planner_households h where h.id=family_id for update;
  if auth.uid() is null or not public.planner_is_member(family_id) then raise exception 'This family space is private.'; end if;
  if profile_id is not null then
    if not exists(select 1 from jsonb_array_elements(document->'members') p where p->>'id'=profile_id)
      then raise exception 'Choose a family member.'; end if;
    if exists(select 1 from public.planner_memberships m where m.household_id=family_id
      and m.member_id=profile_id and m.user_id<>auth.uid())
      then raise exception 'That profile is already linked to another account.'; end if;
    chosen := profile_id;
  else
    if display_name is null or length(btrim(display_name)) not between 1 and 150
      then raise exception 'Enter your name.'; end if;
    chosen := gen_random_uuid()::text;
    document := jsonb_set(document,'{members}',(document->'members') || jsonb_build_array(
      jsonb_build_object('id',chosen,'name',btrim(display_name),'role','Family member','color','lavender','emoji','🌻')));
    if not public.planner_validate_data(document) then raise exception 'This family can have at most 30 profiles.'; end if;
    update public.planner_households set data=document,updated_at=clock_timestamp() where id=family_id;
  end if;
  update public.planner_memberships set member_id=chosen where household_id=family_id and user_id=auth.uid();
end;
$$;

-- Keep the original one-argument join for existing deployments. New visitors
-- select/create their profile after joining; unclaimed profiles remain available.
create or replace function public.planner_protect_profiles()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.planner_memberships m where m.household_id=new.id
    and m.member_id is not null and not exists(select 1 from jsonb_array_elements(new.data->'members') p
      where p->>'id'=m.member_id)) then
    raise exception 'A profile linked to an account cannot be removed.';
  end if;
  return new;
end;
$$;
drop trigger if exists planner_keep_linked_profiles on public.planner_households;
create trigger planner_keep_linked_profiles before update of data on public.planner_households
  for each row execute function public.planner_protect_profiles();

create or replace function public.planner_remove_access(family_id uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  select owner_id into owner from public.planner_households where id=family_id for update;
  if auth.uid() is null or owner is distinct from auth.uid() then raise exception 'Only the family owner can remove access.'; end if;
  if target_user=owner then raise exception 'Transfer ownership before leaving your family.'; end if;
  delete from public.planner_memberships where household_id=family_id and user_id=target_user;
  -- A removed person cannot use an old invitation to regain access.
  delete from public.planner_invites where household_id=family_id;
end;
$$;

create or replace function public.planner_leave_family(family_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  select owner_id into owner from public.planner_households where id=family_id for update;
  if auth.uid() is null or not public.planner_is_member(family_id) then raise exception 'This family space is private.'; end if;
  if owner=auth.uid() then raise exception 'Transfer ownership before leaving your family.'; end if;
  delete from public.planner_memberships where household_id=family_id and user_id=auth.uid();
end;
$$;

create or replace function public.planner_transfer_ownership(family_id uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  select owner_id into owner from public.planner_households where id=family_id for update;
  if auth.uid() is null or owner is distinct from auth.uid() then raise exception 'Only the family owner can transfer ownership.'; end if;
  if target_user=owner or not exists(select 1 from public.planner_memberships m
    where m.household_id=family_id and m.user_id=target_user) then raise exception 'Choose another signed-in family member.'; end if;
  update public.planner_households set owner_id=target_user,updated_at=clock_timestamp() where id=family_id;
  delete from public.planner_invites where household_id=family_id;
end;
$$;

create or replace function public.planner_revoke_invite(family_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.planner_households where id=family_id for update;
  if auth.uid() is null or not exists(select 1 from public.planner_households where id=family_id and owner_id=auth.uid())
    then raise exception 'Only the family owner can revoke invitations.'; end if;
  delete from public.planner_invites where household_id=family_id;
end;
$$;

-- Every restore keeps a recovery copy. Account access is never imported from a file.
create table if not exists public.planner_backups (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.planner_households(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.planner_backups enable row level security;
revoke all on public.planner_backups from anon,authenticated;
grant select on public.planner_backups to authenticated;
drop policy if exists "Owner reads recovery copies" on public.planner_backups;
create policy "Owner reads recovery copies" on public.planner_backups for select to authenticated
  using(exists(select 1 from public.planner_households h where h.id=household_id and h.owner_id=auth.uid()));

create or replace function public.planner_restore_family(family_id uuid, backup jsonb, expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_family public.planner_households; profile jsonb; restored jsonb := backup;
begin
  select * into current_family from public.planner_households where id=family_id for update;
  if auth.uid() is null or current_family.owner_id is distinct from auth.uid() then raise exception 'Only the family owner can restore shared plans.'; end if;
  if expected_updated_at is distinct from current_family.updated_at then
    raise exception 'Plans changed while you were reviewing this backup. Close the preview and open it again.';
  end if;
  if not public.planner_validate_data(restored) then raise exception 'This is not a valid family backup.'; end if;
  -- Preserve profiles added after the backup if they are linked to an account.
  for profile in select p from jsonb_array_elements(current_family.data->'members') p
    where exists(select 1 from public.planner_memberships m where m.household_id=family_id and m.member_id=p->>'id')
    and not exists(select 1 from jsonb_array_elements(restored->'members') r where r->>'id'=p->>'id') loop
    restored := jsonb_set(restored,'{members}',(restored->'members') || jsonb_build_array(profile));
  end loop;
  if not public.planner_validate_data(restored) then raise exception 'This backup would exceed the 30-profile limit.'; end if;
  insert into public.planner_backups(household_id,data) values(family_id,current_family.data);
  update public.planner_households set data=restored,updated_at=clock_timestamp() where id=family_id;
  delete from public.planner_backups b where b.household_id=family_id and b.id not in (
    select id from public.planner_backups where household_id=family_id order by created_at desc,id desc limit 5);
  return restored;
end;
$$;

-- Push subscriptions belong to both an account and its current membership.
create table if not exists public.planner_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  user_id uuid not null,
  endpoint text unique not null,
  p256dh text not null,
  auth text not null,
  timezone text not null,
  scope text not null check(scope in ('mine','family')),
  event_minutes integer not null check(event_minutes in (0,5,15,30,60)),
  chore_time text not null check(chore_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  events_enabled boolean not null default true,
  chores_enabled boolean not null default true,
  foreign key(household_id,user_id) references public.planner_memberships(household_id,user_id) on delete cascade
);
alter table public.planner_push_subscriptions enable row level security;
revoke all on public.planner_push_subscriptions from anon,authenticated;
grant select on public.planner_push_subscriptions to authenticated;
drop policy if exists "Read own devices" on public.planner_push_subscriptions;
create policy "Read own devices" on public.planner_push_subscriptions for select to authenticated using(user_id=auth.uid());

create or replace function public.planner_save_push(subscription jsonb, preferences jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare family uuid; endpoint_value text := subscription->>'endpoint';
begin
  select household_id into family from public.planner_memberships where user_id=auth.uid();
  if family is null then raise exception 'Join a family before enabling reminders.'; end if;
  perform 1 from public.planner_households where id=family for update;
  if not public.planner_is_member(family) then raise exception 'This family space is private.'; end if;
  -- Only browser push services may be contacted by the sender; no arbitrary URLs.
  if endpoint_value is null or length(endpoint_value)>2048 or
    endpoint_value !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[A-Za-z0-9_/?=&%+.:~-]+$'
    then raise exception 'This browser uses an unsupported push service.'; end if;
  if coalesce(subscription->'keys'->>'p256dh','') !~ '^[A-Za-z0-9_-]{80,100}={0,2}$' or
     coalesce(subscription->'keys'->>'auth','') !~ '^[A-Za-z0-9_-]{20,30}={0,2}$'
    then raise exception 'The notification subscription is invalid.'; end if;
  if not exists(select 1 from pg_timezone_names where name=preferences->>'timezone')
    then raise exception 'Choose a valid time zone.'; end if;
  insert into public.planner_push_subscriptions(household_id,user_id,endpoint,p256dh,auth,timezone,scope,event_minutes,chore_time,events_enabled,chores_enabled)
  values(family,auth.uid(),endpoint_value,subscription->'keys'->>'p256dh',subscription->'keys'->>'auth',
    preferences->>'timezone',preferences->>'scope',(preferences->>'event_minutes')::integer,preferences->>'chore_time',
    (preferences->>'events_enabled')::boolean,(preferences->>'chores_enabled')::boolean)
  on conflict(endpoint) do update set household_id=excluded.household_id,user_id=excluded.user_id,
    p256dh=excluded.p256dh,auth=excluded.auth,timezone=excluded.timezone,scope=excluded.scope,event_minutes=excluded.event_minutes,
    chore_time=excluded.chore_time,events_enabled=excluded.events_enabled,chores_enabled=excluded.chores_enabled;
end;
$$;

create or replace function public.planner_remove_push(device_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.planner_push_subscriptions where user_id=auth.uid() and endpoint=device_endpoint;
$$;

create table if not exists public.planner_push_deliveries (
  subscription_id uuid not null references public.planner_push_subscriptions(id) on delete cascade,
  reminder_key text not null,
  claim_token uuid not null,
  lease_until timestamptz not null,
  sent boolean not null default false,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  primary key(subscription_id,reminder_key)
);
alter table public.planner_push_deliveries enable row level security;
revoke all on public.planner_push_deliveries from anon,authenticated;

create or replace function public.planner_push_candidates(after_id uuid, batch_size integer)
returns jsonb language sql stable security definer set search_path = '' as $$
  -- Ordered by id: the sender pages through devices using the last id as a cursor.
  -- Family plans are fetched once per household with planner_push_households.
  select coalesce(jsonb_agg(row_data order by id),'[]'::jsonb) from (
    select s.id, to_jsonb(s)||jsonb_build_object('member_id',m.member_id) as row_data
    from public.planner_push_subscriptions s
    join public.planner_memberships m on m.household_id=s.household_id and m.user_id=s.user_id
    where (after_id is null or s.id>after_id) and (s.events_enabled or s.chores_enabled)
    order by s.id limit greatest(1,least(batch_size,100))) batch;
$$;
create or replace function public.planner_push_households(family_ids uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(h.id,h.data),'{}'::jsonb)
  from public.planner_households h where h.id = any(family_ids);
$$;

create or replace function public.planner_claim_delivery(device_id uuid, delivery_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare token uuid := gen_random_uuid(); claimed uuid;
begin
  -- Membership deletion cascades subscriptions and delivery claims.
  if not exists(select 1 from public.planner_push_subscriptions where id=device_id) then return null; end if;
  insert into public.planner_push_deliveries(subscription_id,reminder_key,claim_token,lease_until)
    values(device_id,delivery_key,token,now()+interval '2 minutes')
    on conflict(subscription_id,reminder_key) do update set claim_token=excluded.claim_token,
      lease_until=excluded.lease_until,attempts=public.planner_push_deliveries.attempts+1
    where not public.planner_push_deliveries.sent and public.planner_push_deliveries.lease_until<now()
      and public.planner_push_deliveries.attempts<3
    returning claim_token into claimed;
  return claimed;
exception when foreign_key_violation then return null;
end;
$$;

create or replace function public.planner_finish_delivery(device_id uuid, delivery_key text, token uuid, delivered boolean)
returns void language sql security definer set search_path = '' as $$
  update public.planner_push_deliveries set sent=delivered,lease_until=now()+interval '30 seconds'
    where subscription_id=device_id and reminder_key=delivery_key and claim_token=token;
$$;

create or replace function public.planner_expire_push(device_id uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.planner_push_subscriptions where id=device_id;
$$;
create or replace function public.planner_clean_deliveries()
returns void language sql security definer set search_path = '' as $$
  delete from public.planner_push_deliveries where created_at < now()-interval '14 days';
$$;

revoke all on function public.planner_get_context(),public.planner_choose_profile(uuid,text,text),
  public.planner_remove_access(uuid,uuid),public.planner_leave_family(uuid),public.planner_transfer_ownership(uuid,uuid),
  public.planner_revoke_invite(uuid),public.planner_restore_family(uuid,jsonb,timestamptz),
  public.planner_save_push(jsonb,jsonb),public.planner_remove_push(text) from public,anon;
grant execute on function public.planner_get_context(),public.planner_choose_profile(uuid,text,text),
  public.planner_remove_access(uuid,uuid),public.planner_leave_family(uuid),public.planner_transfer_ownership(uuid,uuid),
  public.planner_revoke_invite(uuid),public.planner_restore_family(uuid,jsonb,timestamptz),
  public.planner_save_push(jsonb,jsonb),public.planner_remove_push(text) to authenticated;
revoke all on function public.planner_protect_profiles() from public,anon,authenticated;
revoke all on function public.planner_push_candidates(uuid,integer),public.planner_push_households(uuid[]),
  public.planner_claim_delivery(uuid,text),
  public.planner_finish_delivery(uuid,text,uuid,boolean),public.planner_expire_push(uuid),public.planner_clean_deliveries()
  from public,anon,authenticated;
grant execute on function public.planner_push_candidates(uuid,integer),public.planner_push_households(uuid[]),
  public.planner_claim_delivery(uuid,text),
  public.planner_finish_delivery(uuid,text,uuid,boolean),public.planner_expire_push(uuid),public.planner_clean_deliveries()
  to service_role;
-- Live updates: Supabase Realtime tells open apps when a family's plans change.
-- Members only receive changes for families they can read ("Read family plans" policy).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'planner_households'
  ) then
    alter publication supabase_realtime add table public.planner_households;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
