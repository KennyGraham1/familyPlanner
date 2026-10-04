import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createSeed, fromKey, type FamilyEvent } from "../src/lib/data";
import { plannerJsonSchema } from "../src/lib/json-schema";

const sql = readFileSync("supabase/schema.sql", "utf8");

describe("database schema", () => {
  it("matches the app's data model (run npm run db:schema after changing it)", () => {
    const expected = plannerJsonSchema();
    const inline = JSON.parse(sql.match(/\$schema\$([\s\S]*?)\$schema\$/)![1]);
    const file = JSON.parse(
      readFileSync("supabase/planner.schema.json", "utf8"),
    );
    assert.deepEqual(inline, expected);
    assert.deepEqual(file, expected);
  });
});

// Stand-ins for what Supabase provides, so the script can run in plain Postgres.
const supabaseStubs = `
  create role authenticated; create role anon; create role service_role;
  create publication supabase_realtime;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as 'select null::uuid';
  create schema extensions;
  create function extensions.jsonb_matches_schema(schema json, instance jsonb)
    returns boolean language sql as 'select true';
  create function extensions.digest(data text, type text) returns bytea
    language sql as 'select convert_to(data, ''UTF8'')';
  create function extensions.digest(data bytea, type text) returns bytea
    language sql as 'select data';
  create function extensions.gen_random_bytes(n int) returns bytea
    language sql as 'select ''\\x00''::bytea';
`;

describe("schema.sql", () => {
  it("runs, can be run again, and publishes live changes", async () => {
    const db = new PGlite();
    await db.exec(supabaseStubs);
    const script = sql.replace(/^create extension .*$/gm, "");
    await db.exec(script);
    await db.exec(script);
    const published = await db.query(
      "select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'planner_households'",
    );
    assert.equal(published.rows.length, 1, "household changes are sent live");
    await db.close();
  });
});

describe("schema.sql with existing families", () => {
  const seed = createSeed(fromKey("2026-09-28"));
  const ids = {
    a: "00000000-0000-4000-8000-00000000000a",
    b: "00000000-0000-4000-8000-00000000000b",
    family: "00000000-0000-4000-8000-0000000000f1",
  };
  const script = sql.replace(/^create extension .*$/gm, "");
  async function database() {
    const db = new PGlite();
    await db.exec(supabaseStubs);
    await db.exec(
      `insert into auth.users(id) values ('${ids.a}'), ('${ids.b}');`,
    );
    return db;
  }
  const memberIds = async (db: PGlite) =>
    (
      await db.query<{ user_id: string; member_id: string | null }>(
        "select user_id, member_id from public.planner_memberships order by user_id",
      )
    ).rows;

  it("links existing owners to their profile the first time", async () => {
    const db = await database();
    // A database created before profiles were linked to accounts.
    await db.exec(`
      create table public.planner_households (
        id uuid primary key default gen_random_uuid(),
        owner_id uuid not null references auth.users(id) on delete cascade,
        data jsonb not null,
        updated_at timestamptz not null default now());
      create table public.planner_memberships (
        household_id uuid not null references public.planner_households(id) on delete cascade,
        user_id uuid not null references auth.users(id) on delete cascade,
        primary key (household_id, user_id), unique (user_id));
    `);
    await db.query(
      "insert into public.planner_households(id, owner_id, data) values ($1, $2, $3::jsonb)",
      [ids.family, ids.a, JSON.stringify(seed)],
    );
    await db.exec(`insert into public.planner_memberships values
      ('${ids.family}', '${ids.a}'), ('${ids.family}', '${ids.b}');`);
    await db.exec(script);
    assert.deepEqual(await memberIds(db), [
      { user_id: ids.a, member_id: seed.settings.currentMemberId },
      { user_id: ids.b, member_id: null },
    ]);
    await db.close();
  });

  it("leaves profile links alone when re-run after an ownership transfer", async () => {
    const db = await database();
    await db.exec(script);
    // B owns the family now but hasn't chosen a profile; A keeps the shared profile.
    await db.query(
      "insert into public.planner_households(id, owner_id, data) values ($1, $2, $3::jsonb)",
      [ids.family, ids.b, JSON.stringify(seed)],
    );
    await db.exec(`insert into public.planner_memberships(household_id, user_id, member_id) values
      ('${ids.family}', '${ids.a}', '${seed.settings.currentMemberId}'),
      ('${ids.family}', '${ids.b}', null);`);
    await db.exec(script);
    assert.deepEqual(await memberIds(db), [
      { user_id: ids.a, member_id: seed.settings.currentMemberId },
      { user_id: ids.b, member_id: null },
    ]);
    await db.close();
  });

  it("lists reminder devices in order and sends each family's plans once", async () => {
    const db = await database();
    await db.exec(script);
    await db.query(
      "insert into public.planner_households(id, owner_id, data) values ($1, $2, $3::jsonb)",
      [ids.family, ids.a, JSON.stringify(seed)],
    );
    await db.exec(`
      insert into public.planner_memberships(household_id, user_id, member_id) values
        ('${ids.family}', '${ids.a}', 'alex'), ('${ids.family}', '${ids.b}', 'jamie');
      insert into public.planner_push_subscriptions
        (id, household_id, user_id, endpoint, p256dh, auth, timezone, scope, event_minutes, chore_time)
      values
        ('00000000-0000-4000-8000-0000000000d2', '${ids.family}', '${ids.b}', 'https://fcm.googleapis.com/2', 'k', 'a', 'UTC', 'mine', 15, '09:00'),
        ('00000000-0000-4000-8000-0000000000d1', '${ids.family}', '${ids.a}', 'https://fcm.googleapis.com/1', 'k', 'a', 'UTC', 'family', 15, '09:00');
    `);
    const devices = (
      await db.query<{
        rows: { id: string; member_id: string; data?: unknown }[];
      }>("select public.planner_push_candidates(null, 100) as rows")
    ).rows[0].rows;
    assert.deepEqual(
      devices.map((d) => [d.id.slice(-2), d.member_id, "data" in d]),
      [
        ["d1", "alex", false],
        ["d2", "jamie", false],
      ],
    );
    const next = (
      await db.query<{ rows: unknown[] }>(
        "select public.planner_push_candidates($1, 100) as rows",
        [devices[0].id],
      )
    ).rows[0].rows;
    assert.equal(next.length, 1);
    const families = (
      await db.query<{ data: Record<string, unknown> }>(
        "select public.planner_push_households($1::uuid[]) as data",
        [[ids.family]],
      )
    ).rows[0].data;
    assert.deepEqual(Object.keys(families), [ids.family]);
    await db.close();
  });
});

describe("planner_validate_data", () => {
  let db: PGlite;
  const seed = createSeed(fromKey("2026-09-28"));
  const withEvent = (changes: Partial<FamilyEvent>) => ({
    ...seed,
    events: [{ ...seed.events[0], ...changes }],
  });
  const valid = async (document: unknown) =>
    (
      await db.query<{ ok: boolean }>(
        "select public.planner_validate_data($1::jsonb) as ok",
        [JSON.stringify(document)],
      )
    ).rows[0].ok;

  before(async () => {
    db = new PGlite();
    // pg_jsonschema isn't available here; this checks the SQL rules around it.
    await db.exec(`
      create schema extensions;
      create function extensions.jsonb_matches_schema(schema json, instance jsonb)
        returns boolean language sql as 'select true';
    `);
    const fn = sql.match(
      /create or replace function public\.planner_validate_data[\s\S]*?\n\$\$;/,
    );
    assert.ok(fn, "planner_validate_data not found in schema.sql");
    await db.exec(fn[0]);
  });
  after(() => db.close());

  it("accepts the sample family", async () => {
    assert.equal(await valid(seed), true);
  });
  it("accepts overnight multi-day and all-day events", async () => {
    assert.equal(
      await valid(
        withEvent({ endDate: "2026-10-02", start: "18:00", end: "14:00" }),
      ),
      true,
    );
    assert.equal(
      await valid(
        withEvent({ allDay: true, repeat: "yearly", until: "2030-09-28" }),
      ),
      true,
    );
  });
  it("rejects a single-day event that ends before it starts", async () => {
    assert.equal(
      await valid(withEvent({ start: "15:00", end: "14:00" })),
      false,
    );
  });
  it("rejects end and repeat dates before the start", async () => {
    assert.equal(await valid(withEvent({ endDate: "2026-09-27" })), false);
    assert.equal(
      await valid(withEvent({ repeat: "weekly", until: "2026-09-01" })),
      false,
    );
  });
  it("rejects a repeating event as long as its interval", async () => {
    assert.equal(
      await valid(withEvent({ repeat: "weekly", endDate: "2026-10-05" })),
      false,
    );
    assert.equal(
      await valid(withEvent({ repeat: "weekly", endDate: "2026-10-04" })),
      true,
    );
  });
});
