"use client";
import { useState } from "react";
import { Heart, Bookmark, Copy, Plus } from "lucide-react";
import {
  allRecipes,
  categories,
  formatDate,
  recipeSchema,
  shiftDate,
  uid,
  type Feature,
  type Meal,
  type Mutation,
  type Recipe,
} from "@/lib/data";
import { copyMeals, shoppingPlan, weekEntries } from "@/lib/planning";
import { ingredientKey } from "@/lib/quantities";
import { usePlanner } from "./planner-provider";
import { Field, Modal } from "./ui";

export function RecipeSaveButtons({ recipe }: { recipe: Recipe }) {
  const { data, currentMemberId, apply } = usePlanner();
  const pref = data.recipePrefs?.find(
    (p) => p.memberId === currentMemberId && p.recipeId === recipe.id,
  );
  const toggle = (key: "favourite" | "cookSoon") =>
    void apply({
      collection: "recipePrefs",
      action: "upsert",
      value: {
        id: pref?.id ?? `${currentMemberId}:${recipe.id}`,
        memberId: currentMemberId,
        recipeId: recipe.id,
        favourite: pref?.favourite ?? false,
        cookSoon: pref?.cookSoon ?? false,
        [key]: !pref?.[key],
      },
    });
  return (
    <div className="recipe-save-actions">
      <button
        type="button"
        className="button secondary small-button"
        aria-label={`Favourite ${recipe.name}`}
        aria-pressed={pref?.favourite ?? false}
        onClick={() => toggle("favourite")}
      >
        <Heart size={16} fill={pref?.favourite ? "currentColor" : "none"} />{" "}
        Favourite
      </button>
      <button
        type="button"
        className="button secondary small-button"
        aria-label={`Cook ${recipe.name} soon`}
        aria-pressed={pref?.cookSoon ?? false}
        onClick={() => toggle("cookSoon")}
      >
        <Bookmark size={16} fill={pref?.cookSoon ? "currentColor" : "none"} />{" "}
        Cook soon
      </button>
    </div>
  );
}

export function ShoppingReview({
  meals,
  onClose,
}: {
  meals: Pick<Meal, "recipeId" | "servings">[];
  onClose: () => void;
}) {
  const { data, applyWithUndo } = usePlanner();
  const [lines] = useState(() => shoppingPlan(data, meals));
  const [selected, setSelected] = useState(() =>
    lines.filter((l) => !l.inPantry && !l.onList).map((l) => l.id),
  );
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.quantity])),
  );
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const changes: Mutation[] = lines
      .filter((l) => selected.includes(l.id))
      .map((l) => {
        const existing = data.shopping.find(
          (x) => !x.done && ingredientKey(x.name) === l.id,
        );
        return {
          collection: "shopping",
          action: "upsert",
          value: {
            id: existing?.id ?? uid(),
            name: l.name,
            category: l.category,
            quantity: amounts[l.id],
            done: false,
          },
        };
      });
    if (
      await applyWithUndo(
        changes,
        `${changes.length} ingredients saved to shopping.`,
      )
    )
      onClose();
    setSaving(false);
  }
  return (
    <Modal
      title="Check your cupboards"
      subtitle="Quantities include every planned serving. Tick what you need; adjust amounts before saving."
      onClose={onClose}
    >
      {!lines.length && (
        <p>Plan a recipe first. Meal notes do not add ingredients.</p>
      )}
      <div className="shopping-review">
        {lines.map((l) => (
          <div key={l.id} className="shopping-review-line">
            <label>
              <input
                type="checkbox"
                checked={selected.includes(l.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, l.id]
                      : selected.filter((id) => id !== l.id),
                  )
                }
              />
              <span>
                {l.name}
                <small>
                  {l.inPantry
                    ? "In your pantry — check you have enough"
                    : l.onList
                      ? "Already on your list — select to update amount"
                      : "To buy"}
                </small>
              </span>
            </label>
            <input
              aria-label={`Amount of ${l.name}`}
              value={amounts[l.id]}
              maxLength={500}
              onChange={(e) =>
                setAmounts({ ...amounts, [l.id]: e.target.value })
              }
            />
          </div>
        ))}
      </div>
      <button
        className="button primary full-width"
        disabled={saving || !selected.length}
        onClick={() => void save()}
      >
        {saving ? "Saving…" : `Save ${selected.length} ingredients`}
      </button>
    </Modal>
  );
}

export function MealWeekTools({
  start,
  meals,
}: {
  start: string;
  meals: Meal[];
}) {
  const { data, apply, applyWithUndo, notify } = usePlanner();
  const [mode, setMode] = useState<"copy" | "save" | "templates" | null>(null);
  const [chosen, setChosen] = useState<Feature<"mealTemplates"> | null>(null);
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const entries =
    mode === "copy"
      ? weekEntries(data.meals, shiftDate(start, -7))
      : (chosen?.entries ?? []);
  const changes = copyMeals(data, entries, start, replace);
  const catalogue = allRecipes(data);
  return (
    <div className="meal-plan-tools">
      <button
        className="button secondary small-button"
        onClick={() => {
          setReplace(false);
          setMode("copy");
        }}
      >
        <Copy size={15} /> Copy previous week
      </button>
      <button
        className="button secondary small-button"
        disabled={!meals.length}
        onClick={() => setMode("save")}
      >
        <Plus size={15} /> Save week as template
      </button>
      <button
        className="button secondary small-button"
        onClick={() => {
          setChosen(null);
          setReplace(false);
          setMode("templates");
        }}
      >
        Saved templates
      </button>
      {mode && (
        <Modal
          title={
            mode === "save"
              ? "Save a meal template"
              : mode === "copy"
                ? "Copy previous meal week"
                : "Saved meal templates"
          }
          onClose={() => setMode(null)}
        >
          {mode === "save" ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                const name = String(
                  new FormData(e.currentTarget).get("name") ?? "",
                ).trim();
                if (
                  await apply({
                    collection: "mealTemplates",
                    action: "upsert",
                    value: {
                      id: uid(),
                      name,
                      entries: weekEntries(meals, start),
                    },
                  })
                ) {
                  notify("Meal template saved.");
                  setMode(null);
                }
                setBusy(false);
              }}
            >
              <Field label="Template name">
                <input
                  name="name"
                  required
                  maxLength={150}
                  placeholder="e.g. Busy school week"
                />
              </Field>
              <p>{meals.length} meals across breakfast, lunch and dinner.</p>
              <button className="button primary" disabled={busy}>
                Save template
              </button>
            </form>
          ) : (
            <>
              {mode === "templates" && (
                <div className="template-list">
                  {!(data.mealTemplates ?? []).length && (
                    <p>No templates yet. Save a planned week to create one.</p>
                  )}
                  {data.mealTemplates?.map((t) => (
                    <div key={t.id}>
                      <button
                        className={`button secondary ${chosen?.id === t.id ? "active" : ""}`}
                        aria-pressed={chosen?.id === t.id}
                        onClick={() => setChosen(t)}
                      >
                        {t.name} · {t.entries.length} meals
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          void applyWithUndo(
                            {
                              collection: "mealTemplates",
                              action: "remove",
                              id: t.id,
                            },
                            "Template removed.",
                          )
                        }
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {(mode === "copy" || chosen) && (
                <>
                  <p>
                    Plan for {formatDate(start)}–
                    {formatDate(shiftDate(start, 6))}. Existing meals are kept
                    unless you choose replacements.
                  </p>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(e) => setReplace(e.target.checked)}
                    />{" "}
                    Replace occupied slots
                  </label>
                  <ul className="plan-preview">
                    {entries.map((entry, i) => (
                      <li key={i}>
                        {
                          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                            entry.weekday
                          ]
                        }{" "}
                        · {entry.slot}:{" "}
                        {catalogue.find((r) => r.id === entry.recipeId)?.name ??
                          entry.note}
                      </li>
                    ))}
                  </ul>
                  {!entries.length && <p>No meals were planned last week.</p>}
                  <button
                    className="button primary"
                    disabled={busy || !changes.length}
                    onClick={async () => {
                      setBusy(true);
                      if (
                        await applyWithUndo(
                          changes,
                          `${changes.length} meals copied.`,
                        )
                      )
                        setMode(null);
                      setBusy(false);
                    }}
                  >
                    Copy {changes.length} meals
                  </button>
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

export function CustomRecipeButton({ recipe }: { recipe?: Recipe } = {}) {
  const { apply, notify } = usePlanner();
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <button className="button secondary" onClick={() => setOpen(true)}>
        <Plus size={16} /> {recipe ? "Edit family recipe" : "Add family recipe"}
      </button>
      {open && (
        <Modal
          title={recipe ? "Edit your family recipe" : "Add your family recipe"}
          subtitle="Paste a recipe from your notes or a website. Use one ingredient and one method step per line."
          onClose={() => setOpen(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget);
              const get = (key: string) => String(f.get(key) ?? "").trim();
              const parsed = recipeSchema.safeParse({
                id: recipe?.id ?? uid(),
                name: get("name"),
                subtitle: get("description"),
                time: Number(get("time")),
                servings: Number(get("servings")),
                category: "Family recipe",
                cuisine: get("cuisine"),
                image: recipe?.image ?? "/images/recipe-placeholder.svg",
                color: "sage",
                ingredients: get("ingredients")
                  .split("\n")
                  .filter(Boolean)
                  .map((line) => {
                    const [name, quantity, category] = line
                      .split("|")
                      .map((s) => s.trim());
                    return {
                      name,
                      quantity: quantity ?? "",
                      category: categories.includes(
                        category as (typeof categories)[number],
                      )
                        ? category
                        : "Other",
                    };
                  }),
                steps: get("steps").split("\n").filter(Boolean),
                ...(get("source")
                  ? { source: { name: "Original recipe", url: get("source") } }
                  : {}),
              });
              if (!parsed.success) {
                setError(parsed.error.issues[0].message);
                return;
              }
              setBusy(true);
              if (
                await apply({
                  collection: "customRecipes",
                  action: "upsert",
                  value: parsed.data,
                })
              ) {
                notify("Family recipe saved.");
                setOpen(false);
              }
              setBusy(false);
            }}
          >
            <Field label="Recipe name">
              <input
                name="name"
                required
                maxLength={150}
                defaultValue={recipe?.name}
              />
            </Field>
            <Field label="Description">
              <input
                name="description"
                maxLength={300}
                defaultValue={recipe?.subtitle}
              />
            </Field>
            <div className="form-grid">
              <Field label="Minutes total">
                <input
                  name="time"
                  type="number"
                  required
                  min={1}
                  max={1440}
                  defaultValue={recipe?.time ?? 30}
                />
              </Field>
              <Field label="Serves">
                <input
                  name="servings"
                  type="number"
                  min={1}
                  max={50}
                  defaultValue={recipe?.servings ?? 4}
                  required
                />
              </Field>
            </div>
            <Field label="Cuisine">
              <input
                name="cuisine"
                defaultValue={recipe?.cuisine}
                placeholder="e.g. Ghanaian"
                maxLength={100}
              />
            </Field>
            <Field
              label="Ingredients"
              hint="One per line: ingredient | quantity | aisle (optional)"
            >
              <textarea
                name="ingredients"
                defaultValue={recipe?.ingredients
                  .map((i) => `${i.name} | ${i.quantity} | ${i.category}`)
                  .join("\n")}
                rows={6}
                required
                placeholder={"Rice | 300 g | Pantry\nTomatoes | 4 | Produce"}
              />
            </Field>
            <Field label="Method">
              <textarea
                name="steps"
                rows={6}
                required
                defaultValue={recipe?.steps.join("\n")}
              />
            </Field>
            <Field label="Original recipe link (optional)">
              <input
                name="source"
                defaultValue={recipe?.source?.url}
                type="url"
                placeholder="https://"
              />
            </Field>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              Save recipe
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
