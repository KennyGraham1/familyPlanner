export const normalizeSearch = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const groups = [
  "swim swimming pool",
  "football soccer",
  "grocery groceries shopping food",
  "chores chore tasks task jobs",
  "recipe recipes dishes meals dinner supper",
  "ghana ghanaian",
  "kids children child boys girls",
  "light lighter healthy",
  "vegetarian meatfree",
  "appointment appointments doctor clinic",
  "favourite favourites favorite favorites",
  "chickpeas garbanzo",
  "aubergine eggplant",
  "coriander cilantro",
].map((s) => s.split(" "));
const variants = (word: string) => {
  const stem = word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word;
  return new Set([
    word,
    stem,
    ...groups.filter((g) => g.includes(word) || g.includes(stem)).flat(),
  ]);
};
function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  let previous: number[] | undefined;
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) {
      let cost = Math.min(
        next[j] + 1,
        row[j + 1] + 1,
        row[j] + Number(a[i] !== b[j]),
      );
      if (i > 0 && j > 0 && a[i] === b[j - 1] && a[i - 1] === b[j] && previous)
        cost = Math.min(cost, previous[j - 1] + 1);
      next.push(cost);
    }
    previous = row;
    row = next;
  }
  return row[b.length];
}
export function matchScore(title: string, text: string, query: string) {
  const q = normalizeSearch(query);
  if (!q) return 1;
  const main = normalizeSearch(title),
    other = normalizeSearch(text);
  const words = main.split(" "),
    more = other.split(" ");
  let score =
    main === q ? 200 : main.startsWith(q) ? 100 : main.includes(q) ? 70 : 0;
  for (const token of q
    .split(" ")
    .filter(
      (t) =>
        !["the", "a", "an", "for", "with", "and", "of", "at", "in"].includes(t),
    )) {
    const alternatives = variants(token);
    let best = 0;
    for (const word of words) {
      if (word === token) best = Math.max(best, 30);
      else if (word.startsWith(token)) best = Math.max(best, 20);
      else if (alternatives.has(word)) best = Math.max(best, 16);
      else if (
        token.length >= 3 &&
        word.length >= 4 &&
        distance(word, token) <= (token.length >= 8 ? 2 : 1)
      )
        best = Math.max(best, 8);
    }
    for (const word of more) {
      if (alternatives.has(word)) best = Math.max(best, 10);
      else if (word.startsWith(token)) best = Math.max(best, 6);
      else if (
        token.length >= 3 &&
        word.length >= 4 &&
        distance(word, token) === 1
      )
        best = Math.max(best, 3);
    }
    if (!best) return 0;
    score += best;
  }
  return score;
}
