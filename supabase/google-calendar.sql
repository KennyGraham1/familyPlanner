-- Optional two-way Google Calendar sync. Run after schema.sql.
-- Tokens are encrypted by the server. These tables have no browser access.
begin;
create table if not exists public.planner_google_connections (
  household_id uuid primary key references public.planner_households(id) on delete cascade,
  user_id uuid not null,
  google_account_id text not null,
  account_email text not null,
  encrypted_token text,
  calendar_id text unique,
  calendar_name text,
  timezone text,
  member_id text,
  enabled boolean not null default false,
  last_synced_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  issues jsonb not null default '[]',
  conflicts jsonb not null default '[]',
  lease_token uuid,
  lease_until timestamptz,
  foreign key(household_id,user_id) references public.planner_memberships(household_id,user_id) on delete cascade
);
create table if not exists public.planner_google_events (
  household_id uuid not null references public.planner_google_connections(household_id) on delete cascade,
  event_id text not null,
  google_id text not null,
  local_hash text,
  google_hash text,
  primary key(household_id,event_id),
  unique(household_id,google_id)
);
create table if not exists public.planner_google_oauth (
  state_hash text primary key,
  household_id uuid not null,
  user_id uuid not null,
  encrypted_verifier text not null,
  expires_at timestamptz not null,
  foreign key(household_id,user_id) references public.planner_memberships(household_id,user_id) on delete cascade
);
alter table public.planner_google_connections enable row level security;
alter table public.planner_google_events enable row level security;
alter table public.planner_google_oauth enable row level security;
revoke all on public.planner_google_connections, public.planner_google_events, public.planner_google_oauth from public, anon, authenticated;
grant select,insert,update,delete on public.planner_google_connections, public.planner_google_events, public.planner_google_oauth to service_role;
grant select on public.planner_households, public.planner_memberships to service_role;

-- One worker per family. A stopped request's lease expires without manual cleanup.
create or replace function public.planner_google_claim(family_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare token uuid := gen_random_uuid();
begin
  update public.planner_google_connections c set enabled=false,last_error='The family owner needs to reconnect Google Calendar.'
    where c.household_id=family_id and not exists(select 1 from public.planner_households h where h.id=family_id and h.owner_id=c.user_id);
  update public.planner_google_connections c set lease_token=token, lease_until=clock_timestamp()+interval '2 minutes',last_attempt_at=clock_timestamp()
    where c.household_id=family_id and c.enabled and c.encrypted_token is not null
    and (c.lease_until is null or c.lease_until < clock_timestamp())
    and exists(select 1 from public.planner_households h where h.id=family_id and h.owner_id=c.user_id);
  if not found then return null; end if;
  return token;
end;
$$;

-- Merge only the affected event into the latest family document. Family members
-- can keep editing unrelated plans while a Google sync request is in flight.
create or replace function public.planner_google_commit(
  family_id uuid, token uuid, local_id text, expected_local jsonb,
  change_local boolean, next_local jsonb, link jsonb
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare document jsonb; current_event jsonb; items jsonb; owner uuid;
begin
  select h.data,h.owner_id into document,owner from public.planner_households h where h.id=family_id for update;
  perform 1 from public.planner_google_connections c where c.household_id=family_id
    and c.user_id=owner and c.enabled and c.encrypted_token is not null
    and c.lease_token=token and c.lease_until>clock_timestamp() for update;
  if not found then raise exception 'Calendar sync lease expired.'; end if;
  select e into current_event from jsonb_array_elements(document->'events') e where e->>'id'=local_id;
  if change_local then
    if current_event is distinct from expected_local then return false; end if;
    select coalesce(jsonb_agg(e order by ord),'[]'::jsonb) into items
      from jsonb_array_elements(document->'events') with ordinality as x(e,ord) where e->>'id'<>local_id;
    if next_local is not null then
      if next_local->>'id' is distinct from local_id then raise exception 'Invalid event ID.'; end if;
      items:=items||jsonb_build_array(next_local);
    end if;
    document:=jsonb_set(document,'{events}',items);
    if not public.planner_validate_data(document) then raise exception 'Calendar event could not be saved.'; end if;
    update public.planner_households set data=document,updated_at=clock_timestamp() where id=family_id;
  end if;
  if link is null then
    delete from public.planner_google_events where household_id=family_id and event_id=local_id;
  else
    insert into public.planner_google_events(household_id,event_id,google_id,local_hash,google_hash)
      values(family_id,local_id,link->>'google_id',link->>'local_hash',link->>'google_hash')
      on conflict(household_id,event_id) do update set google_id=excluded.google_id,local_hash=excluded.local_hash,google_hash=excluded.google_hash;
  end if;
  return true;
end;
$$;

-- Disconnect is serialized with the sync lease and preserves events on both sides.
create or replace function public.planner_google_disconnect(family_id uuid, account_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- A new owner can detach the previous owner's account, but can never use its tokens.
  delete from public.planner_google_connections c where c.household_id=family_id and c.user_id<>account_id
    and (c.lease_until is null or c.lease_until<clock_timestamp())
    and exists(select 1 from public.planner_households h where h.id=family_id and h.owner_id=account_id);
  if found then return true; end if;
  update public.planner_google_connections c set enabled=false,encrypted_token=null,last_error=null,conflicts='[]',issues='[]'
    where c.household_id=family_id and c.user_id=account_id
    and (c.lease_until is null or c.lease_until<clock_timestamp())
    and exists(select 1 from public.planner_households h where h.id=family_id and h.owner_id=account_id);
  return found;
end;
$$;
revoke all on function public.planner_google_claim(uuid) from public,anon,authenticated;
revoke all on function public.planner_google_commit(uuid,uuid,text,jsonb,boolean,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.planner_google_disconnect(uuid,uuid) from public,anon,authenticated;
grant execute on function public.planner_google_claim(uuid) to service_role;
grant execute on function public.planner_google_commit(uuid,uuid,text,jsonb,boolean,jsonb,jsonb) to service_role;
grant execute on function public.planner_google_disconnect(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
