"use client";
import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
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
  ingredientsToShopping,
  recipes,
  startOfWeek,
  uid,
  type Meal,
  type Recipe,
} from "@/lib/data";
import { usePlanner } from "./planner-provider";
import { Field, Modal, SectionHeader } from "./ui";
import type { ViewProps } from "./overview";

export function RecipeModal({
  recipe,
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
  const [date, setDate] = useState(initialDate ?? dateKey(new Date()));
  const [slot, setSlot] = useState<Meal["slot"]>(
    initialSlot ?? (recipe.category === "Breakfast" ? "Breakfast" : "Dinner"),
  );
  const [tab, setTab] = useState<"ingredients" | "method">("ingredients");
  const [checked, setChecked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  async function addIngredients() {
    const items = ingredientsToShopping(data, [recipe.id]);
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
      value: { id: existing?.id ?? uid(), date, slot, recipeId: recipe.id },
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
      />
      <div className="recipe-modal-meta">
        <span>
          <Clock3 size={16} />
          {recipe.time} minutes
        </span>
        <span>
          <Users size={16} />
          Serves {recipe.servings}
        </span>
        <span>
          <Leaf size={16} />
          {recipe.category}
        </span>
      </div>
      <div className="recipe-tabs">
        <button
          className={tab === "ingredients" ? "active" : ""}
          onClick={() => setTab("ingredients")}
        >
          Ingredients
        </button>
        <button
          className={tab === "method" ? "active" : ""}
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
                <strong>{i.quantity}</strong>
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
        <ol className="method-list">
          {recipe.steps.map((step, i) => (
            <li key={step}>
              <span>{i + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
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
  const { data, apply, notify } = usePlanner();
  const [week, setWeek] = useState(
    startOfWeek(new Date(), data.settings.weekStartsMonday),
  );
  const [slot, setSlot] = useState<Meal["slot"]>("Dinner");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All recipes");
  const [pickDate, setPickDate] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Recipe | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const weekMeals = data.meals.filter(
    (m) => m.date >= dateKey(week) && m.date <= dateKey(addDays(week, 6)),
  );
  const visible = recipes.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "All recipes" ||
        (filter === "Quick & easy" && r.time <= 25) ||
        (filter === "Meat-free" &&
          [
            "Vegetarian",
            "Plant-based",
            "Breakfast",
            "Family favourite",
          ].includes(r.category))),
  );
  async function shopWeek() {
    const items = ingredientsToShopping(
      data,
      weekMeals.map((m) => m.recipeId),
    );
    if (!items.length) {
      notify(
        weekMeals.length
          ? "Your list already has everything. Check quantities for repeat meals."
          : "Plan a meal first, then we’ll help with the shopping.",
      );
      return;
    }
    if (
      await apply(
        items.map((value) => ({
          collection: "shopping",
          action: "upsert",
          value,
        })),
      )
    )
      notify(
        `${items.length} missing ingredients added. Check quantities if you’re cooking a dish twice.`,
      );
  }
  return (
    <>
      <div className="meal-intro">
        <span className="intro-icon peach">
          <Utensils size={27} />
        </span>
        <div>
          <h2>Good food. Less “what’s for dinner?”</h2>
          <p>A little planning now, more time around the table later.</p>
        </div>
        <button className="button primary" onClick={shopWeek}>
          <ShoppingBasket size={17} /> Shop this week
        </button>
      </div>
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
        </div>
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
                {recipe ? (
                  <>
                    <button
                      className="planned-meal"
                      onClick={() => openRecipe(recipe)}
                    >
                      <img src={recipe.image} alt={recipe.name} />
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
                        onClick={async () => {
                          if (
                            await apply({
                              collection: "meals",
                              action: "remove",
                              id: meal!.id,
                            })
                          )
                            notify("Meal removed from the plan.");
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                ) : (
                  <button className="add-meal" onClick={() => setPickDate(key)}>
                    <Plus size={22} />
                    <span>
                      Plan a little
                      <br />
                      something
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="meal-week-footer">
          <Sparkles size={14} />
          {weekMeals.length} meals planned this week. Future you says thanks!
        </div>
      </section>
      <div className="recipe-library-heading">
        <SectionHeader icon={BookOpen} title="A little recipe inspiration" />
        <p>
          Tried-and-loved ideas for your family table. Tap one to get cooking.
        </p>
      </div>
      <div className="recipe-library-toolbar">
        <div className="family-filters">
          {["All recipes", "Quick & easy", "Meat-free"].map((f) => (
            <button
              className={`filter-chip ${filter === f ? "active" : ""}`}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f === "Meat-free" && <Leaf size={14} />} {f}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search recipes"
            placeholder="Find something delicious…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div className="recipe-grid">
        {visible.map((r) => (
          <button
            className="card recipe-card"
            key={r.id}
            onClick={() => openRecipe(r)}
          >
            <div className="recipe-card-image">
              <img src={r.image} alt={r.name} loading="lazy" />
              <span className="recipe-heart">
                <Heart size={17} />
              </span>
            </div>
            <div className="recipe-card-content">
              <span className={`recipe-category ${r.color}`}>{r.category}</span>
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
        ))}
      </div>
      {!visible.length && (
        <p className="no-results">No recipes found. Try another search.</p>
      )}
      {pickDate && !chosen && (
        <Modal
          title={`What’s for ${slot.toLowerCase()}?`}
          subtitle={`Choose something delicious for ${formatDate(pickDate, { weekday: "long", day: "numeric", month: "long" })}.`}
          onClose={() => setPickDate(null)}
        >
          <div className="recipe-picker">
            {recipes.map((r) => (
              <button key={r.id} onClick={() => setChosen(r)}>
                <img src={r.image} alt="" />
                <span>
                  <strong>{r.name}</strong>
                  <small>
                    {r.time} min · Serves {r.servings}
                  </small>
                </span>
                <Plus size={18} />
              </button>
            ))}
          </div>
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
        duplicating items already on your list. Adjust quantities for your
        family.
      </div>
    </>
  );
}
