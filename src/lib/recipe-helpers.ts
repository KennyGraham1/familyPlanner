import type { Recipe, ShoppingItem } from "./data";

type RecipeInput = Omit<
  Recipe,
  "time" | "ingredients" | "image" | "color" | "servings" | "category"
> & {
  cuisine: string;
  region: "West Africa" | "Everyday";
  diet: NonNullable<Recipe["diet"]>;
  prepTime: number;
  cookTime: number;
  servingSuggestion: string;
  tips: string[];
  ingredients: [string, string, ShoppingItem["category"]][];
  illustration?: "rice" | "stew" | "greens" | "breakfast" | "tray";
  servings?: number;
  category?: string;
};

export function defineRecipe(input: RecipeInput): Recipe {
  const { ingredients, illustration = "stew", ...rest } = input;
  return {
    ...rest,
    time: input.prepTime + input.cookTime + (input.restTime ?? 0),
    servings: input.servings ?? 4,
    category:
      input.category ??
      (input.diet === "Meat & fish" ? "Family favourite" : input.diet),
    color: input.region === "West Africa" ? "peach" : "sage",
    image: `/images/recipes/${illustration}.svg`,
    ingredients: ingredients.map(([name, quantity, category]) => ({
      name,
      quantity,
      category,
    })),
  };
}

export function matchesRecipe(recipe: Recipe, query: string) {
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const text = normalize(
    [
      recipe.name,
      recipe.subtitle,
      recipe.cuisine,
      recipe.region,
      ...recipe.ingredients.map((i) => i.name),
    ].join(" "),
  );
  return normalize(query)
    .trim()
    .split(/\s+/)
    .every((word) => text.includes(word));
}

export function isMeatFree(recipe: Recipe) {
  return recipe.diet
    ? recipe.diet !== "Meat & fish"
    : !recipe.ingredients.some((i) => i.category === "Meat & fish");
}
