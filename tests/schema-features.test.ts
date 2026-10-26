import { before, after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  createSeed,
  dataSchema,
  recipes,
  type Mutation,
  type PlannerData,
} from "../src/lib/data";
import { rewardBalance } from "../src/lib/planning";
const owner = "00000000-0000-4000-8000-000000000001",
  member = "00000000-0000-4000-8000-000000000002";
describe("shared planner feature transactions", () => {
  let db: PGlite, family: string;
  const apply = async (changes: Mutation[]) =>
    (
      await db.query<{ data: PlannerData }>(
        "select public.planner_apply_changes($1,$2::jsonb) as data",
        [family, JSON.stringify(changes)],
      )
    ).rows[0].data;
  before(async () => {
    db = new PGlite();
    await db.exec(
      `create role authenticated;create role anon;create role service_role;create publication supabase_realtime;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''test.uid'',true),'''')::uuid';create schema extensions;create function extensions.jsonb_matches_schema(schema json,instance jsonb) returns boolean language sql as 'select true';create function extensions.digest(data text,type text) returns bytea language sql as 'select convert_to(data,''UTF8'')';create function extensions.gen_random_bytes(n int) returns bytea language sql as 'select decode(repeat(''00'',n),''hex'')';`,
    );
    await db.exec(
      readFileSync("supabase/schema.sql", "utf8").replace(
        /^create extension .*$/gm,
        "",
      ),
    );
    await db.exec(
      `insert into auth.users values ('${owner}','parent@example.com'),('${member}','family@example.com');set test.uid='${owner}';`,
    );
    const data = createSeed();
    family = (
      await db.query<{ id: string }>(
        "select public.planner_create_family($1::jsonb) as id",
        [JSON.stringify(data)],
      )
    ).rows[0].id;
    await db.query(
      "insert into public.planner_memberships(household_id,user_id,member_id) values ($1,$2,'jamie')",
      [family, member],
    );
  });
  after(() => db.close());
  it("adds shared features to an existing family and records a trusted, parseable author", async () => {
    const data = await apply([
      {
        collection: "pantry",
        action: "upsert",
        value: {
          id: "rice",
          name: "Rice",
          quantity: "1 kg",
          category: "Pantry",
        },
      },
      {
        collection: "meals",
        action: "upsert",
        value: {
          id: "leftovers",
          date: "2026-12-31",
          slot: "Dinner",
          note: "Leftovers",
        },
      },
      {
        collection: "events",
        action: "upsert",
        value: {
          ...createSeed().events[0],
          title: "School run updated",
          pickupMemberId: "alex",
        },
      },
    ]);
    assert.ok(dataSchema.safeParse(data).success);
    assert.equal(data.activity?.at(-1)?.actorId, owner);
    assert.equal(data.activity?.at(-1)?.source, "server");
    await assert.rejects(
      () =>
        apply([
          {
            collection: "activity",
            action: "remove",
            id: data.activity!.at(-1)!.id,
          },
        ]),
      /Unknown change/,
    );
  });
  it("validates family recipes, preference ownership and template slots", async () => {
    const custom = {
      ...recipes[0],
      id: "family-recipe",
      color: "sage" as const,
    };
    const data = await apply([
      { collection: "customRecipes", action: "upsert", value: custom },
      {
        collection: "recipePrefs",
        action: "upsert",
        value: {
          id: "fav",
          memberId: "alex",
          recipeId: custom.id,
          favourite: true,
          cookSoon: false,
        },
      },
      {
        collection: "mealTemplates",
        action: "upsert",
        value: {
          id: "week",
          name: "School week",
          entries: [{ weekday: 1, slot: "Dinner", recipeId: custom.id }],
        },
      },
    ]);
    assert.ok(dataSchema.safeParse(data).success);
    await assert.rejects(
      () =>
        apply([
          {
            collection: "recipePrefs",
            action: "upsert",
            value: {
              id: "forged",
              memberId: "jamie",
              recipeId: custom.id,
              favourite: true,
              cookSoon: false,
            },
          },
        ]),
      /own recipe/,
    );
    await assert.rejects(
      () =>
        apply([
          {
            collection: "recipePrefs",
            action: "upsert",
            value: {
              id: "bad",
              memberId: "alex",
              recipeId: "missing",
              favourite: true,
              cookSoon: false,
            },
          },
        ]),
      /not valid/,
    );
  });
  it("assigns comment authors on the server and rejects another member deleting them", async () => {
    const data = await apply([
      {
        collection: "comments",
        action: "upsert",
        value: {
          id: "comment",
          eventId: "e1",
          memberId: "oliver",
          body: "Bring towels",
          createdAt: "2000-01-01T00:00:00.000Z",
        },
      },
    ]);
    assert.equal(data.comments?.[0].memberId, "alex");
    assert.notEqual(data.comments?.[0].createdAt, "2000-01-01T00:00:00.000Z");
    assert.ok(dataSchema.safeParse(data).success);
    await db.exec(`set test.uid='${member}'`);
    await assert.rejects(
      () =>
        apply([{ collection: "comments", action: "remove", id: "comment" }]),
      /author or family owner/,
    );
    await db.exec(`set test.uid='${owner}'`);
  });
  it("uses the same star balance as the app, reserves rewards once and enforces approval", async () => {
    const data = await apply([
      {
        collection: "routines",
        action: "upsert",
        value: {
          id: "routine",
          title: "Morning",
          memberId: "jamie",
          period: "Morning",
          days: [1, 2, 3, 4, 5],
          steps: [{ id: "bag", title: "School bag" }],
        },
      },
      {
        collection: "routineChecks",
        action: "upsert",
        value: {
          id: "routine:2026-11-02",
          routineId: "routine",
          memberId: "jamie",
          date: "2026-11-02",
          steps: ["bag"],
        },
      },
      {
        collection: "rewards",
        action: "upsert",
        value: {
          id: "reward",
          title: "Choose a movie",
          memberId: "jamie",
          cost: 1,
        },
      },
    ]);
    const sqlBalance = (
      await db.query<{ balance: number }>(
        "select public.planner_reward_balance($1::jsonb,'jamie')::int as balance",
        [JSON.stringify(data)],
      )
    ).rows[0].balance;
    assert.equal(sqlBalance, rewardBalance(data, "jamie"));
    const claim = {
      id: "reward:2026-11-02",
      rewardId: "reward",
      memberId: "jamie",
      date: "2026-11-02",
      cost: 1,
      approved: false,
    };
    await db.exec(`set test.uid='${member}'`);
    const claimed = await apply([
      { collection: "rewardClaims", action: "upsert", value: claim },
    ]);
    const again = await apply([
      { collection: "rewardClaims", action: "upsert", value: claim },
    ]);
    assert.equal(
      rewardBalance(again, "jamie"),
      rewardBalance(claimed, "jamie"),
    );
    await assert.rejects(
      () =>
        apply([
          {
            collection: "rewardClaims",
            action: "upsert",
            value: { ...claim, approved: true },
          },
        ]),
      /family owner/,
    );
    await db.exec(`set test.uid='${owner}'`);
    const approved = await apply([
      {
        collection: "rewardClaims",
        action: "upsert",
        value: { ...claim, approved: true },
      },
    ]);
    assert.equal(approved.rewardClaims?.[0].approved, true);
  });
  it("can apply the generated upgrade twice without changing plans or access", async () => {
    const before = (
      await db.query<{ data: PlannerData }>(
        "select data from public.planner_households where id=$1",
        [family],
      )
    ).rows[0].data;
    const migration = readFileSync("supabase/update-planner.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);
    const after = (
      await db.query<{ data: PlannerData }>(
        "select data from public.planner_households where id=$1",
        [family],
      )
    ).rows[0].data;
    assert.deepEqual(after, before);
    assert.equal(
      (
        await db.query(
          "select * from public.planner_memberships where household_id=$1",
          [family],
        )
      ).rows.length,
      2,
    );
  });
});
