import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  createSeed,
  dataSchema,
  fromKey,
  ingredientsToShopping,
  recipes,
  shoppingSchema,
} from "../src/lib/data";
import { isMeatFree, matchesRecipe } from "../src/lib/recipe-helpers";

it("has 60 distinct, complete recipes, including a broad set of 24 West African dishes", () => {
  assert.equal(recipes.length, 60);
  assert.equal(new Set(recipes.map((r) => r.id)).size, 60);
  const regional = recipes.filter((r) => r.region === "West Africa");
  assert.equal(regional.length, 24);
  for (const cuisine of [
    "Nigeria",
    "Ghana",
    "Senegal",
    "Mali & Senegal",
    "The Gambia",
    "Côte d’Ivoire",
  ])
    assert.ok(
      regional.some((r) => r.cuisine === cuisine),
      cuisine,
    );
  for (const recipe of recipes) {
    assert.ok(
      recipe.cuisine && recipe.servingSuggestion && recipe.tips?.length,
      recipe.id,
    );
    assert.equal(
      recipe.time,
      (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0) + (recipe.restTime ?? 0),
      recipe.id,
    );
    assert.ok(
      recipe.steps.length >= 4 &&
        recipe.steps.every((step) => step.length > 30),
      recipe.id,
    );
    assert.ok(existsSync(`public${recipe.image}`), recipe.image);
    assert.ok(recipe.ingredients.length >= 4, recipe.id);
    assert.equal(
      new Set(recipe.ingredients.map((i) => i.name.toLowerCase())).size,
      recipe.ingredients.length,
      recipe.id,
    );
    if (recipe.region === "West Africa")
      assert.ok(recipe.source?.url.startsWith("https://"), recipe.id);
  }
});

it("searches countries, accented dish names and ingredients without confusing meat-free dishes", () => {
  const find = (id: string) => recipes.find((r) => r.id === id)!;
  assert.ok(matchesRecipe(find("attieke-fish"), "attieke"));
  assert.ok(matchesRecipe(find("attieke-fish"), "cote ivoire"));
  assert.ok(matchesRecipe(find("beef-maafe"), "maafe"));
  assert.ok(matchesRecipe(find("domoda"), "gambia peanut"));
  assert.ok(matchesRecipe(find("egusi-soup"), "melon"));
  assert.equal(matchesRecipe(find("chicken-yassa"), "Nigeria"), false);
  assert.equal(isMeatFree(find("chicken-yassa")), false);
  assert.equal(isMeatFree(find("efo-riro")), false);
  assert.equal(isMeatFree(find("tacos")), true);
  assert.equal(isMeatFree(find("red-red")), true);
  assert.ok(
    find("overnight-oats").time > 30,
    "inactive time counts towards quick recipes",
  );
});

it("every recipe produces valid, deduplicated shopping items and persists in a family document", () => {
  for (const recipe of recipes) {
    const family = createSeed(fromKey("2026-10-04"));
    family.shopping = [];
    const items = ingredientsToShopping(family, [recipe.id, recipe.id]);
    assert.equal(items.length, recipe.ingredients.length, recipe.id);
    for (const item of items) shoppingSchema.parse(item);
    family.shopping = items;
    assert.equal(
      ingredientsToShopping(family, [recipe.id]).length,
      0,
      recipe.id,
    );
    family.meals = [
      {
        id: "new-meal",
        date: "2026-10-04",
        slot: "Dinner",
        recipeId: recipe.id,
      },
    ];
    dataSchema.parse(JSON.parse(JSON.stringify(family)));
  }
});

describe("shared recipe validation", () => {
  const sql = readFileSync("supabase/schema.sql", "utf8");
  const update = readFileSync("supabase/update-recipes.sql", "utf8");
  const fn = (text: string) =>
    text.match(
      /create or replace function public\.planner_validate_data[\s\S]*?\n\$\$;/,
    )![0];
  let db: PGlite;
  before(async () => {
    db = new PGlite();
    // pg_jsonschema is supplied by Supabase. Here we exercise the actual SQL's
    // recipe/reference validation; the separate app-schema tests cover structure.
    await db.exec(
      "create schema extensions; create function extensions.jsonb_matches_schema(schema json, instance jsonb) returns boolean language sql as 'select true';",
    );
    await db.exec(fn(sql));
    await db.exec(fn(update));
  });
  after(() => db.close());

  it("keeps the full setup and existing-project update in sync", () => {
    assert.equal(fn(update), fn(sql));
    const ids = [
      ...sql
        .match(/item->>'recipeId' not in \(([^)]+)\)/)![1]
        .matchAll(/'([^']+)'/g),
    ].map((match) => match[1]);
    assert.deepEqual(
      ids,
      recipes.map((r) => r.id),
      "Run npm run db:schema after editing the library",
    );
  });

  it("accepts all 60 recipes and rejects unknown recipes in PostgreSQL", async () => {
    const family = createSeed(fromKey("2026-10-04"));
    for (const recipeId of [...recipes.map((r) => r.id), "does-not-exist"]) {
      family.meals = [
        { id: "new-meal", date: "2026-10-04", slot: "Dinner", recipeId },
      ];
      const result = await db.query<{ valid: boolean }>(
        "select public.planner_validate_data($1::jsonb) as valid",
        [JSON.stringify(family)],
      );
      assert.equal(
        result.rows[0].valid,
        recipeId !== "does-not-exist",
        recipeId,
      );
    }
  });
});
