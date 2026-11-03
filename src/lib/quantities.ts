type Amount = {
  amount: number;
  unit: string;
  family: string;
  factor: number;
  suffix: string;
};
const units: Record<string, [string, string, number]> = {
  g: ["g", "mass", 1],
  gram: ["g", "mass", 1],
  grams: ["g", "mass", 1],
  kg: ["kg", "mass", 1000],
  kilogram: ["kg", "mass", 1000],
  kilograms: ["kg", "mass", 1000],
  ml: ["ml", "volume", 1],
  l: ["l", "volume", 1000],
  litre: ["l", "volume", 1000],
  litres: ["l", "volume", 1000],
  liter: ["l", "volume", 1000],
  liters: ["l", "volume", 1000],
  tsp: ["tsp", "spoon", 1],
  teaspoon: ["tsp", "spoon", 1],
  teaspoons: ["tsp", "spoon", 1],
  tbsp: ["tbsp", "spoon", 3],
  tablespoon: ["tbsp", "spoon", 3],
  tablespoons: ["tbsp", "spoon", 3],
  cup: ["cup", "cup", 1],
  cups: ["cup", "cup", 1],
};
const fractions: Record<string, string> = {
  "½": "1/2",
  "¼": "1/4",
  "¾": "3/4",
  "⅓": "1/3",
  "⅔": "2/3",
  "⅛": "1/8",
};
function parse(text: string): Amount | null {
  const normalized = text
    .replace(/(\d)([½¼¾⅓⅔⅛])/g, "$1 $2")
    .replace(/[½¼¾⅓⅔⅛]/g, (v) => fractions[v]);
  const match = normalized.match(
    /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)(\s*)([a-zA-Z]*)(.*)$/,
  );
  if (!match) return null;
  const [, digits, gap, word, rest] = match;
  const number = digits.split(/\s+/).reduce((sum, part) => {
    const [a, b] = part.split("/").map(Number);
    return sum + (b ? a / b : a);
  }, 0);
  if (!Number.isFinite(number)) return null;
  // A second number ("2–3", "4 large (about 1 kg)") can't be scaled with the first.
  const unit = units[word.toLowerCase()];
  if (unit)
    return /\d/.test(rest)
      ? null
      : {
          amount: number,
          unit: unit[0],
          family: unit[1],
          factor: unit[2],
          suffix: rest,
        };
  // Anything else is counted: "3 cloves", "2 large", "2 × 400 g cans".
  const counted = gap + word + rest;
  if (/\d/.test(counted) && !/^\s*[×x]\s*\d/i.test(counted)) return null;
  return {
    amount: number,
    unit: "",
    family: "count",
    factor: 1,
    suffix: counted,
  };
}
const rounded = (n: number) => String(Math.round(n * 100) / 100);
export function scaleQuantity(text: string, factor: number): string {
  if (factor === 1) return text;
  const value = parse(text);
  if (value)
    return `${rounded(value.amount * factor)}${value.unit ? ` ${value.unit}` : ""}${value.suffix}`;
  // "To taste" or "a pinch" has nothing to multiply.
  return /\d/.test(text) ? `${rounded(factor)} × (${text})` : text;
}
export function combineQuantities(a: string, b: string): string {
  const x = parse(a),
    y = parse(b);
  if (x && y && x.family === y.family && x.suffix.trim() === y.suffix.trim()) {
    return `${rounded(x.amount + (y.amount * y.factor) / x.factor)}${x.unit ? ` ${x.unit}` : ""}${x.suffix}`;
  }
  if (a === b) return /\d/.test(a) ? `2 × (${a})` : a;
  return `${a} + ${b}`;
}
export const ingredientKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
