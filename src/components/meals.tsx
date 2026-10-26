"use client";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Leaf,
  Plus,
  Search,
  ShoppingBasket,
  Sparkles,
  Trash2,
  Users,
  Utensils,
} from "lucide-react";
import {
  addDays,
  dateKey,
  formatDate,
  allRecipes,
  startOfWeek,
  uid,
  type Meal,
  type Recipe,
} from "@/lib/data";
import { usePlanner } from "./planner-provider";
import {
  RecipeSaveButtons,
  MealWeekTools,
  ShoppingReview,
  CustomRecipeButton,
} from "./meal-tools";
import { scaleQuantity } from "@/lib/quantities";
import { shoppingPlan } from "@/lib/planning";
import {
  isMeatFree,
  matchesRecipe,
  recipeSearchScore,
} from "@/lib/recipe-helpers";
import { Field, Modal, SectionHeader } from "./ui";
import type { ViewProps } from "./overview";

export function RecipeModal({
  recipe: originalRecipe,
  onClose,
  initialDate,
  initialSlot,
}: {
  recipe: Recipe;
  onClose: () => void;
  initialDate?: string;
  initialSlot?: Meal["slot"];
}) {
  const { data, apply, notify } = usePlanner();
  const recipe =
    data.customRecipes?.find((r) => r.id === originalRecipe.id) ??
    originalRecipe;
  const [date, setDate] = useState(initialDate ?? dateKey(new Date()));
  const [slot, setSlot] = useState<Meal["slot"]>(
    initialSlot ?? (recipe.category === "Breakfast" ? "Breakfast" : "Dinner"),
  );
  const [tab, setTab] = useState<"ingredients" | "method">("ingredients");
  const [checked, setChecked] = useState<number[]>([]);
  const [servings, setServings] = useState(recipe.servings);
  const [busy, setBusy] = useState(false);
  async function addIngredients() {
    const lines = shoppingPlan(data, [{ recipeId: recipe.id, servings }]);
    const items = lines
      .filter((l) => !l.onList && !l.inPantry)
      .map((l) => ({
        id: uid(),
        name: l.name,
        quantity: l.quantity,
        category: l.category,
        done: false,
      }));
    if (!items.length) {
      notify("You already have these ingredients on your list.");
      return;
    }
    setBusy(true);
    if (
      await apply(
        items.map((value) => ({
          collection: "shopping",
          action: "upsert",
          value,
        })),
      )
    )
      notify(`${items.length} ingredients added to your shopping list.`);
    setBusy(false);
  }
  async function planMeal(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const existing = data.meals.find((m) => m.date === date && m.slot === slot);
    const ok = await apply({
      collection: "meals",
      action: "upsert",
      value: {
        id: existing?.id ?? uid(),
        date,
        slot,
        recipeId: recipe.id,
        servings,
      },
    });
    setBusy(false);
    if (ok) {
      notify(`${slot} sorted for ${formatDate(date)}. Delicious!`);
      onClose();
    }
  }
  return (
    <Modal
      title={recipe.name}
      subtitle={recipe.subtitle}
      onClose={onClose}
      wide
    >
      <img
        className="recipe-modal-photo"
        src={recipe.image}
        alt={recipe.name}
        decoding="async"
        width={960}
        height={640}
      />
      <RecipeSaveButtons recipe={recipe} />
      {data.customRecipes?.some((r) => r.id === recipe.id) && (
        <CustomRecipeButton recipe={recipe} />
      )}
      <Field label="Servings">
        <input
          type="number"
          min={1}
          max={50}
          required
          value={servings}
          onChange={(e) =>
            setServings(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
          }
        />
      </Field>
      <div className="recipe-modal-meta">
        <span>
          <Clock3 size={16} />
          {recipe.time} minutes total
        </span>
        <span>
          <Users size={16} />
          Serves {recipe.servings}
        </span>
        <span>
          <Leaf size={16} />
          {recipe.category}
        </span>
        <span>{recipe.cuisine}</span>
      </div>
      {recipe.prepTime !== undefined && (
        <p className="recipe-timing">
          Prep {recipe.prepTime} min · Cook {recipe.cookTime} min
          {!!recipe.restTime &&
            ` · ${recipe.restLabel ?? "Rest"} ${recipe.restTime} min`}
        </p>
      )}
      <div className="recipe-tabs">
        <button
          className={tab === "ingredients" ? "active" : ""}
          aria-pressed={tab === "ingredients"}
          onClick={() => setTab("ingredients")}
        >
          Ingredients
        </button>
        <button
          className={tab === "method" ? "active" : ""}
          aria-pressed={tab === "method"}
          onClick={() => setTab("method")}
        >
          Let’s make it
        </button>
      </div>
      {tab === "ingredients" ? (
        <>
          <div className="ingredient-list">
            {recipe.ingredients.map((i, n) => (
              <label
                key={i.name}
                className={checked.includes(n) ? "is-done" : ""}
              >
                <input
                  type="checkbox"
                  checked={checked.includes(n)}
                  onChange={() =>
                    setChecked(
                      checked.includes(n)
                        ? checked.filter((v) => v !== n)
                        : [...checked, n],
                    )
                  }
                />
                <span>{i.name}</span>
                <strong>
                  {scaleQuantity(i.quantity, servings / recipe.servings)}
                </strong>
              </label>
            ))}
          </div>
          <button
            className="button secondary full-width"
            disabled={busy}
            onClick={addIngredients}
          >
            <ShoppingBasket size={16} /> Add missing ingredients to shopping
            list
          </button>
        </>
      ) : (
        <>
          <ol className="method-list">
            {recipe.steps.map((step, i) => (
              <li key={step}>
                <span>{i + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
          {!!recipe.tips?.length && (
            <div className="recipe-notes">
              <h3>Cooking tips & substitutions</h3>
              <ul>
                {recipe.tips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </div>
          )}
          {recipe.source && (
            <p className="recipe-source">
              Explore this dish:{" "}
              <a href={recipe.source.url} target="_blank" rel="noreferrer">
                {recipe.source.name}
              </a>
              . Our recipe is a home-kitchen adaptation.
            </p>
          )}
        </>
      )}
      {recipe.servingSuggestion && (
        <div className="recipe-notes">
          <h3>To serve</h3>
          <p>{recipe.servingSuggestion}</p>
        </div>
      )}
      <form className="plan-meal-form" onSubmit={planMeal}>
        <h3>
          <CalendarIcon /> Make it part of the plan
        </h3>
        <div className="form-grid">
          <Field label="Which day?">
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Which meal?">
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value as Meal["slot"])}
            >
              {["Breakfast", "Lunch", "Dinner"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
        </div>
        {data.meals.some((m) => m.date === date && m.slot === slot) && (
          <p className="form-hint">
            This will replace the {slot.toLowerCase()} currently planned for
            that day.
          </p>
        )}
        <button
          className="button primary full-width"
          disabled={busy}
          type="submit"
        >
          <Plus size={16} />
          {busy ? "Saving…" : "Add to meal plan"}
        </button>
      </form>
    </Modal>
  );
}
function CalendarIcon() {
  return <Utensils size={18} />;
}

export function Meals({ openRecipe }: ViewProps) {
  const { data, apply, applyWithUndo, notify, currentMemberId } = usePlanner();
  const recipes = allRecipes(data);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [mealNote, setMealNote] = useState("");
  const [week, setWeek] = useState(
    startOfWeek(new Date(), data.settings.weekStartsMonday),
  );
  const [slot, setSlot] = useState<Meal["slot"]>("Dinner");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All recipes");
  const [limit, setLimit] = useState(12);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickDate, setPickDate] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Recipe | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const weekMeals = data.meals.filter(
    (m) => m.date >= dateKey(week) && m.date <= dateKey(addDays(week, 6)),
  );
  const visible = recipes
    .filter(
      (r) =>
        matchesRecipe(r, search) &&
        (filter === "All recipes" ||
          (filter === "Favourites" &&
            data.recipePrefs?.some(
              (p) =>
                p.memberId === currentMemberId &&
                p.recipeId === r.id &&
                p.favourite,
            )) ||
          (filter === "Cook soon" &&
            data.recipePrefs?.some(
              (p) =>
                p.memberId === currentMemberId &&
                p.recipeId === r.id &&
                p.cookSoon,
            )) ||
          (filter === "West African" && r.region === "West Africa") ||
          (filter === "Ghanaian" && r.cuisine === "Ghana") ||
          (filter === "Lighter meals" && r.lighter) ||
          (filter === "Quick & easy" && r.time <= 30) ||
          (filter === "Meat-free" && isMeatFree(r))),
    )
    .sort(
      (a, b) => recipeSearchScore(b, search) - recipeSearchScore(a, search),
    );
  function shopWeek() {
    if (!weekMeals.length) {
      notify("Plan a meal first, then check your cupboards.");
      return;
    }
    setShoppingOpen(true);
  }
  return (
    <>
      {shoppingOpen && (
        <ShoppingReview
          meals={weekMeals}
          onClose={() => setShoppingOpen(false)}
        />
      )}
      <CustomRecipeButton />
      <section className="card meal-week">
        <div className="meal-week-header">
          <div className="date-navigation">
            <button
              className="icon-button"
              aria-label="Previous meal week"
              onClick={() => setWeek(addDays(week, -7))}
            >
              <ChevronLeft size={18} />
            </button>
            <h3>
              {formatDate(week)} – {formatDate(addDays(week, 6))}
            </h3>
            <button
              className="icon-button"
              aria-label="Next meal week"
              onClick={() => setWeek(addDays(week, 7))}
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="toolbar-actions">
            <div className="segmented-control">
              {(["Breakfast", "Lunch", "Dinner"] as const).map((s) => (
                <button
                  key={s}
                  className={slot === s ? "active" : ""}
                  onClick={() => setSlot(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <button className="button secondary" onClick={shopWeek}>
              <ShoppingBasket size={17} /> Shop this week
            </button>
          </div>
        </div>
        <MealWeekTools start={dateKey(week)} meals={weekMeals} />
        <div className="meal-days">
          {days.map((d) => {
            const key = dateKey(d),
              meal = data.meals.find((m) => m.date === key && m.slot === slot),
              recipe = recipes.find((r) => r.id === meal?.recipeId);
            return (
              <div
                key={key}
                className={`meal-day ${key === dateKey(new Date()) ? "today" : ""}`}
              >
                <div className="meal-day-label">
                  <span>{formatDate(d, { weekday: "short" })}</span>
                  <strong>{d.getDate()}</strong>
                  {key === dateKey(new Date()) && <small>Today</small>}
                </div>
                {meal?.note ? (
                  <>
                    <div className="meal-note">{meal.note}</div>
                    <button
                      className="text-button"
                      onClick={() =>
                        void applyWithUndo(
                          {
                            collection: "meals",
                            action: "remove",
                            id: meal.id,
                          },
                          "Meal note removed.",
                        )
                      }
                    >
                      Remove note
                    </button>
                  </>
                ) : recipe ? (
                  <>
                    <button
                      className="planned-meal"
                      onClick={() => {
                        setPickDate(key);
                        setChosen(recipe);
                      }}
                    >
                      <img
                        src={recipe.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <strong>{recipe.name}</strong>
                      <small>
                        <Clock3 size={12} />
                        {recipe.time} min
                      </small>
                    </button>
                    <div className="meal-day-actions">
                      <button onClick={() => setPickDate(key)}>
                        Swap meal
                      </button>
                      <button
                        aria-label={`Remove ${slot.toLowerCase()} on ${formatDate(d)}`}
                        onClick={() =>
                          void applyWithUndo(
                            {
                              collection: "meals",
                              action: "remove",
                              id: meal!.id,
                            },
                            `${recipe.name} removed from the plan.`,
                          )
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="add-meal" onClick={() => setPickDate(key)}>
                    <Plus size={22} />
                    <span>Add a meal</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="meal-week-footer">
          <Sparkles size={14} />
          {weekMeals.length} {weekMeals.length === 1 ? "meal" : "meals"} planned
          this week
        </div>
      </section>
      <div className="recipe-library-heading">
        <SectionHeader icon={BookOpen} title="Recipes" />
        <p>
          {recipes.length} recipes for your family, including{" "}
          {recipes.filter((r) => r.region === "West Africa").length} from across
          West Africa.
        </p>
      </div>
      <div className="recipe-library-toolbar">
        <div className="family-filters">
          {[
            "All recipes",
            "Favourites",
            "Cook soon",
            "Ghanaian",
            "Lighter meals",
            "West African",
            "Quick & easy",
            "Meat-free",
          ].map((f) => (
            <button
              className={`filter-chip ${filter === f ? "active" : ""}`}
              key={f}
              aria-pressed={filter === f}
              onClick={() => {
                setFilter(f);
                setLimit(12);
              }}
            >
              {f === "Meat-free" && <Leaf size={14} />} {f}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search recipes"
            placeholder="Dish, country or ingredient…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setLimit(12);
            }}
          />
        </label>
      </div>
      {filter === "Lighter meals" && (
        <p className="lighter-meals-note">
          Vegetable-rich meals with beans, fish, eggs or lean meat, measured oil
          and practical serving suggestions.{" "}
          <a
            href="https://www.nhs.uk/better-health/lose-weight/healthy-eating-when-trying-to-lose-weight/"
            target="_blank"
            rel="noreferrer"
          >
            Balanced meal ideas
          </a>
        </p>
      )}
      <p className="recipe-result-count" aria-live="polite">
        Showing {Math.min(limit, visible.length)} of {visible.length} recipes
      </p>
      <div className="recipe-grid">
        {visible.slice(0, limit).map((r) => (
          <article className="card recipe-card" key={r.id}>
            <button className="recipe-open" onClick={() => openRecipe(r)}>
              <div className="recipe-card-image">
                <img
                  src={r.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  width={960}
                  height={640}
                />
              </div>
              <div className="recipe-card-content">
                <span className={`recipe-category ${r.color}`}>
                  {r.lighter ? "Lighter meal" : r.category}
                </span>
                <span className="recipe-cuisine">{r.cuisine}</span>
                <h3>{r.name}</h3>
                <p>{r.subtitle}</p>
                <div className="recipe-meta">
                  <span>
                    <Clock3 size={14} />
                    {r.time} min
                  </span>
                  <span>
                    <Users size={14} />
                    Serves {r.servings}
                  </span>
                  <ArrowRight size={17} />
                </div>
              </div>
            </button>
            <RecipeSaveButtons recipe={r} />
          </article>
        ))}
      </div>
      {visible.length > limit && (
        <div className="recipe-load-more">
          <button
            className="button secondary"
            onClick={() => setLimit(limit + 12)}
          >
            Show {Math.min(12, visible.length - limit)} more recipes
          </button>
        </div>
      )}
      {!visible.length && (
        <p className="no-results">No recipes found. Try another search.</p>
      )}
      {pickDate && !chosen && (
        <Modal
          title={`What’s for ${slot.toLowerCase()}?`}
          subtitle={`Choose something delicious for ${formatDate(pickDate, { weekday: "long", day: "numeric", month: "long" })}.`}
          onClose={() => setPickDate(null)}
        >
          <form
            className="meal-note-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await apply({
                  collection: "meals",
                  action: "upsert",
                  value: {
                    id: uid(),
                    date: pickDate,
                    slot,
                    note: mealNote.trim(),
                  },
                })
              ) {
                setPickDate(null);
                setMealNote("");
                notify("Meal note saved.");
              }
            }}
          >
            <Field label="Or add a meal note">
              <input
                placeholder="Leftovers, eating out, packed lunch…"
                maxLength={150}
                required
                value={mealNote}
                onChange={(e) => setMealNote(e.target.value)}
              />
            </Field>
            <button className="button secondary" disabled={!mealNote.trim()}>
              Save meal note
            </button>
          </form>
          <label className="search-field recipe-picker-search">
            <Search size={17} />
            <input
              aria-label="Search meals for this day"
              placeholder="Dish, country or ingredient…"
              value={pickerSearch}
              onChange={(e) => setPickerSearch(e.target.value)}
            />
          </label>
          <div className="recipe-picker">
            {recipes
              .filter((r) => matchesRecipe(r, pickerSearch))
              .sort(
                (a, b) =>
                  recipeSearchScore(b, pickerSearch) -
                  recipeSearchScore(a, pickerSearch),
              )
              .map((r) => (
                <button key={r.id} onClick={() => setChosen(r)}>
                  <img src={r.image} alt="" loading="lazy" decoding="async" />
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {r.cuisine} · {r.time} min · Serves {r.servings}
                    </small>
                  </span>
                  <Plus size={18} />
                </button>
              ))}
          </div>
          {!recipes.some((r) => matchesRecipe(r, pickerSearch)) && (
            <p className="no-results" role="status">
              No recipes found. Try a dish, country or ingredient.
            </p>
          )}
        </Modal>
      )}
      {chosen && (
        <RecipeModal
          recipe={chosen}
          initialDate={pickDate ?? undefined}
          initialSlot={slot}
          onClose={() => {
            setChosen(null);
            setPickDate(null);
          }}
        />
      )}
      <div className="help-note">
        <Check size={15} /> Shopping adds missing ingredients without
        duplicating items already on your list. Review servings and cupboard
        ingredients before saving.
      </div>
    </>
  );
}
