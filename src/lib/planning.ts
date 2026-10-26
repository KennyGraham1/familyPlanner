import {
  allRecipes,
  dateKey,
  dayNumber,
  fromKey,
  shiftDate,
  uid,
  type Feature,
  type Meal,
  type Mutation,
  type PlannerData,
} from "./data";
import { combineQuantities, ingredientKey, scaleQuantity } from "./quantities";

export function copyMeals(
  data: PlannerData,
  entries: Feature<"mealTemplates">["entries"],
  start: string,
  replace: boolean,
): Mutation[] {
  const firstWeekday = fromKey(start).getDay();
  return entries.flatMap((entry) => {
    const date = shiftDate(start, (entry.weekday - firstWeekday + 7) % 7);
    const existing = data.meals.find(
      (m) => m.date === date && m.slot === entry.slot,
    );
    if (existing && !replace) return [];
    const { weekday: _, ...meal } = entry;
    void _;
    return [
      {
        collection: "meals" as const,
        action: "upsert" as const,
        value: { ...meal, date, id: existing?.id ?? uid() },
      },
    ];
  });
}
export function weekEntries(meals: Meal[], start: string) {
  return meals
    .filter((m) => m.date >= start && m.date <= shiftDate(start, 6))
    .map(({ date, id: _, ...meal }) => {
      void _;
      return { ...meal, weekday: fromKey(date).getDay() };
    });
}
export function shoppingPlan(
  data: PlannerData,
  meals: Pick<Meal, "recipeId" | "servings">[],
) {
  const catalogue = allRecipes(data);
  const lines = new Map<
    string,
    {
      name: string;
      quantity: string;
      category: PlannerData["shopping"][number]["category"];
    }
  >();
  for (const meal of meals) {
    const recipe = catalogue.find((r) => r.id === meal.recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) {
      const key = ingredientKey(ingredient.name),
        quantity = scaleQuantity(
          ingredient.quantity,
          (meal.servings ?? recipe.servings) / recipe.servings,
        );
      const previous = lines.get(key);
      lines.set(key, {
        ...ingredient,
        quantity: previous
          ? combineQuantities(previous.quantity, quantity)
          : quantity,
      });
    }
  }
  return [...lines.values()].map((line) => ({
    ...line,
    id: ingredientKey(line.name),
    onList: data.shopping.some(
      (x) => !x.done && ingredientKey(x.name) === ingredientKey(line.name),
    ),
    inPantry:
      data.pantry?.some(
        (x) => ingredientKey(x.name) === ingredientKey(line.name),
      ) ?? false,
  }));
}
export function familyDate(data: PlannerData, now = new Date()) {
  return data.settings.timezone
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: data.settings.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now)
    : dateKey(now);
}
export function routineDue(routine: Feature<"routines">, date: string) {
  return (
    routine.days.includes(fromKey(date).getDay()) &&
    (!routine.from || date >= routine.from) &&
    (!routine.until || date <= routine.until) &&
    !routine.excludedDates?.includes(date) &&
    !routine.excludedRanges?.some((r) => date >= r.start && date <= r.end)
  );
}
export function rewardBalance(data: PlannerData, memberId: string) {
  const choreStars = data.tasks.filter(
    (t) => t.memberId === memberId && t.done && t.doneAt,
  ).length;
  const routineStars = (data.routineChecks ?? []).filter((c) => {
    const r = data.routines?.find((r) => r.id === c.routineId);
    return (
      c.memberId === memberId &&
      r &&
      routineDue(r, c.date) &&
      r.steps.every((s) => c.steps.includes(s.id))
    );
  }).length;
  const spent = (data.rewardClaims ?? [])
    .filter((c) => c.memberId === memberId)
    .reduce((sum, c) => sum + c.cost, 0);
  return choreStars + routineStars - spent;
}
export function skippedDates(event: PlannerData["events"][number]) {
  const dates = new Set(event.excludedDates ?? []);
  for (const range of event.excludedRanges ?? [])
    for (
      let i = 0;
      i <= Math.min(366, dayNumber(range.end) - dayNumber(range.start));
      i++
    )
      dates.add(shiftDate(range.start, i));
  return [...dates].sort();
}
