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
    $schema${"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"version":{"type":"number","const":1},"settings":{"type":"object","properties":{"familyName":{"type":"string","minLength":1,"maxLength":150},"currentMemberId":{"type":"string","minLength":1,"maxLength":100},"weekStartsMonday":{"type":"boolean"}},"required":["familyName","currentMemberId","weekStartsMonday"],"additionalProperties":false},"members":{"minItems":1,"maxItems":30,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"name":{"type":"string","minLength":1,"maxLength":150},"role":{"type":"string","maxLength":50},"color":{"type":"string","enum":["lavender","sage","peach","blue","rose","yellow"]},"emoji":{"type":"string","maxLength":10}},"required":["id","name","role","color","emoji"],"additionalProperties":false}},"events":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"title":{"type":"string","minLength":1,"maxLength":150},"date":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"start":{"type":"string","pattern":"^([01]\\d|2[0-3]):[0-5]\\d$"},"end":{"type":"string","pattern":"^([01]\\d|2[0-3]):[0-5]\\d$"},"memberIds":{"minItems":1,"type":"array","items":{"type":"string","minLength":1,"maxLength":100}},"location":{"type":"string","maxLength":200},"notes":{"type":"string","maxLength":2000},"repeat":{"type":"string","enum":["none","weekly"]},"category":{"type":"string","enum":["Activity","School","Appointment","Family time","Work"]}},"required":["id","title","date","start","end","memberIds","location","notes","repeat","category"],"additionalProperties":false}},"tasks":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"title":{"type":"string","minLength":1,"maxLength":150},"memberId":{"type":"string","minLength":1,"maxLength":100},"due":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"done":{"type":"boolean"},"priority":{"type":"string","enum":["normal","high"]}},"required":["id","title","memberId","due","done","priority"],"additionalProperties":false}},"shopping":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"name":{"type":"string","minLength":1,"maxLength":150},"quantity":{"type":"string","maxLength":50},"category":{"type":"string","enum":["Produce","Dairy & eggs","Meat & fish","Bakery","Pantry","Household","Other"]},"done":{"type":"boolean"}},"required":["id","name","quantity","category","done"],"additionalProperties":false}},"meals":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"date":{"type":"string","pattern":"^\\d{4}-\\d{2}-\\d{2}$"},"slot":{"type":"string","enum":["Breakfast","Lunch","Dinner"]},"recipeId":{"type":"string","minLength":1,"maxLength":100}},"required":["id","date","slot","recipeId"],"additionalProperties":false}},"notes":{"maxItems":5000,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","minLength":1,"maxLength":100},"title":{"type":"string","minLength":1,"maxLength":150},"body":{"type":"string","minLength":1,"maxLength":2000},"memberId":{"type":"string","minLength":1,"maxLength":100},"color":{"type":"string","enum":["lavender","sage","peach","blue","rose","yellow"]},"pinned":{"type":"boolean"},"createdAt":{"type":"string","format":"date-time","pattern":"^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z))$"}},"required":["id","title","body","memberId","color","pinned","createdAt"],"additionalProperties":false}}},"required":["version","settings","members","events","tasks","shopping","meals","notes"],"additionalProperties":false}$schema$::json,
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
        if item->>'end' <= item->>'start' then return false; end if;
        for reference in select jsonb_array_elements_text(item->'memberIds') loop
          if not (reference = any(member_ids)) then return false; end if;
        end loop;
      end if;
      if collection in ('events','meals') and to_char((item->>'date')::date,'YYYY-MM-DD') <> item->>'date' then return false; end if;
      if collection = 'tasks' and to_char((item->>'due')::date,'YYYY-MM-DD') <> item->>'due' then return false; end if;
      if collection = 'meals' and item->>'recipeId' not in ('pasta','tacos','salmon','curry','pizza','pancakes') then return false; end if;
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
  insert into public.planner_memberships(household_id,user_id) values(family_id,auth.uid());
  return family_id;
end;
$$;

create or replace function public.planner_apply_changes(family_id uuid, changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare document jsonb; change jsonb; collection text; action text; items jsonb; record_id text;
begin
  if auth.uid() is null or not public.planner_is_member(family_id) then raise exception 'This family space is private.'; end if;
  if jsonb_typeof(changes) is distinct from 'array' or octet_length(changes::text) > 5000000 then raise exception 'Invalid changes.'; end if;
  if jsonb_array_length(changes) > 1000 then raise exception 'Please save fewer changes at once.'; end if;
  -- Lock the latest document before applying changes. Concurrent clients cannot overwrite unrelated changes.
  select h.data into document from public.planner_households h where h.id = family_id for update;
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
  update public.planner_households set data = document, updated_at = now() where id = family_id;
  return document;
end;
$$;

create or replace function public.planner_create_invite(family_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare token text;
begin
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
commit;
