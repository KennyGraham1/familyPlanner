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
  ml: ["ml", "volume", 1],
  l: ["l", "volume", 1000],
  litres: ["l", "volume", 1000],
  tsp: ["tsp", "spoon", 1],
  tbsp: ["tbsp", "spoon", 3],
  cup: ["cup", "cup", 1],
  cups: ["cup", "cup", 1],
};
function parse(text: string): Amount | null {
  const normalized = text
    .replace(/(\d)([½¼¾⅓⅔])/g, "$1 $2")
    .replace(
      /[½¼¾⅓⅔]/g,
      (v) =>
        ({ "½": "1/2", "¼": "1/4", "¾": "3/4", "⅓": "1/3", "⅔": "2/3" })[v]!,
    );
  const match = normalized.match(
    /^((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)\s*([a-zA-Z]*)(.*)$/,
  );
  if (!match) return null;
  const number = match[1].split(/\s+/).reduce((sum, part) => {
    const [a, b] = part.split("/").map(Number);
    return sum + (b ? a / b : a);
  }, 0);
  if (!Number.isFinite(number) || /[-–\d]/.test(match[3])) return null;
  const unit = match[2].toLowerCase();
  if (unit && !units[unit]) return null;
  const [canonical, family, factor] = units[unit] ?? ["", "count", 1];
  return { amount: number, unit: canonical, family, factor, suffix: match[3] };
}
const rounded = (n: number) => String(Math.round(n * 100) / 100);
export function scaleQuantity(text: string, factor: number): string {
  if (factor === 1) return text;
  const value = parse(text);
  return value
    ? `${rounded(value.amount * factor)}${value.unit ? ` ${value.unit}` : ""}${value.suffix}`
    : `${rounded(factor)} × (${text})`;
}
export function combineQuantities(a: string, b: string): string {
  const x = parse(a),
    y = parse(b);
  if (x && y && x.family === y.family && x.suffix.trim() === y.suffix.trim()) {
    return `${rounded(x.amount + (y.amount * y.factor) / x.factor)}${x.unit ? ` ${x.unit}` : ""}${x.suffix}`;
  }
  if (a === b) return `2 × (${a})`;
  return `${a} + ${b}`;
}
export const ingredientKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
