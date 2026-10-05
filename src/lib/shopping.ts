import { recipes, type ShoppingItem } from "./data";

type Aisle = ShoppingItem["category"];
// Common words by aisle. Phrases are checked before single words, so
// "peanut butter" lands in Pantry rather than Dairy.
const keywords: Record<Exclude<Aisle, "Other">, string[]> = {
  "Dairy & eggs": [
    "milk",
    "cheese",
    "butter",
    "yoghurt",
    "yogurt",
    "cream",
    "egg",
    "feta",
    "mozzarella",
    "parmesan",
    "cheddar",
    "custard",
  ],
  "Meat & fish": [
    "chicken",
    "beef",
    "lamb",
    "pork",
    "mince",
    "sausage",
    "bacon",
    "ham",
    "fish",
    "salmon",
    "tuna",
    "prawn",
    "shrimp",
    "turkey",
    "steak",
    "goat",
  ],
  Bakery: [
    "bread",
    "loaf",
    "bagel",
    "bun",
    "roll",
    "croissant",
    "wrap",
    "tortilla",
    "pita",
    "muffin",
    "sourdough",
    "crumpet",
  ],
  Household: [
    "soap",
    "detergent",
    "toilet paper",
    "tissue",
    "bin bag",
    "foil",
    "cling film",
    "sponge",
    "bleach",
    "shampoo",
    "toothpaste",
    "nappy",
    "nappies",
    "battery",
    "batteries",
    "dishwasher",
    "laundry",
    "washing powder",
  ],
  Produce: [
    "apple",
    "banana",
    "orange",
    "lemon",
    "lime",
    "avocado",
    "tomato",
    "potato",
    "onion",
    "garlic",
    "carrot",
    "spinach",
    "lettuce",
    "cucumber",
    "pepper",
    "broccoli",
    "berry",
    "berries",
    "strawberry",
    "strawberries",
    "grape",
    "herb",
    "coriander",
    "parsley",
    "ginger",
    "plantain",
    "mushroom",
    "courgette",
    "zucchini",
    "kale",
    "pear",
    "fruit",
    "salad",
    "kumara",
    "pumpkin",
    "cabbage",
  ],
  Pantry: [
    "rice",
    "pasta",
    "flour",
    "sugar",
    "salt",
    "oil",
    "cereal",
    "oats",
    "bean",
    "lentil",
    "tin",
    "can",
    "sauce",
    "stock",
    "spice",
    "honey",
    "jam",
    "peanut butter",
    "coconut milk",
    "coffee",
    "tea",
    "biscuit",
    "cracker",
    "noodle",
    "chocolate",
    "vinegar",
    "cracker",
  ],
};
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
// Matches whole words, allowing a plural "s"/"es" ("tomatoes" matches "tomato").
const containsPhrase = (text: string, phrase: string) =>
  new RegExp(`(^| )${phrase}(e?s)?( |$)`).test(text);

const phrases: [string, Aisle][] = (() => {
  const all: [string, Aisle][] = [];
  for (const [aisle, words] of Object.entries(keywords))
    for (const word of words) all.push([word, aisle as Aisle]);
  for (const recipe of recipes)
    for (const ingredient of recipe.ingredients)
      if (ingredient.category !== "Other")
        all.push([normalize(ingredient.name), ingredient.category]);
  // Longest first: the most specific match wins.
  return all.sort((a, b) => b[0].length - a[0].length);
})();

/**
 * Suggests a shopping aisle for an item name: what the family filed it under
 * before, then recipe ingredients and common words. Null when unsure.
 */
export function guessAisle(
  name: string,
  previous: ShoppingItem[] = [],
): Aisle | null {
  const text = normalize(name);
  if (text.length < 2) return null;
  const known = previous.find((item) => normalize(item.name) === text);
  if (known) return known.category;
  for (const [phrase, aisle] of phrases)
    if (phrase && containsPhrase(text, phrase)) return aisle;
  return null;
}
