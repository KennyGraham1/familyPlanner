import { westAfricanRecipes } from "./recipes-west-africa";
import { everydayRecipes } from "./recipes-everyday";
import { ghanaianRecipes } from "./recipes-ghana";

const lighterEveryday = new Set([
  "minestrone",
  "tomato-bean-soup",
  "chicken-noodle-soup",
  "chicken-stir-fry",
  "vegetable-couscous",
  "shakshuka",
  "spinach-frittata",
  "stuffed-sweet-potatoes",
]);
export const extraRecipes = [
  ...westAfricanRecipes,
  ...ghanaianRecipes,
  ...everydayRecipes.map((recipe) =>
    lighterEveryday.has(recipe.id) ? { ...recipe, lighter: true } : recipe,
  ),
];
