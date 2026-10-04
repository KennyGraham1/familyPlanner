import { z } from "zod";

export const colors = [
  "lavender",
  "sage",
  "peach",
  "blue",
  "rose",
  "yellow",
] as const;
export const categories = [
  "Produce",
  "Dairy & eggs",
  "Meat & fish",
  "Bakery",
  "Pantry",
  "Household",
  "Other",
] as const;
const id = z.string().min(1).max(100);
const short = z.string().trim().min(1).max(150);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T12:00:00");
    return !isNaN(d.getTime()) && dateKey(d) === v;
  }, "Choose a valid date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const memberSchema = z.object({
  id,
  name: short,
  role: z.string().max(50),
  color: z.enum(colors),
  emoji: z.string().max(10),
});
export const repeats = [
  "none",
  "weekly",
  "fortnightly",
  "monthly",
  "yearly",
] as const;
export const repeatLabels: Record<(typeof repeats)[number], string> = {
  none: "Does not repeat",
  weekly: "Every week",
  fortnightly: "Every 2 weeks",
  monthly: "Every month",
  yearly: "Every year",
};
// Shortest gap between occurrences; a multi-day repeating event must be shorter.
const repeatInterval = { weekly: 7, fortnightly: 14, monthly: 28, yearly: 365 };
/** Days since 1970-01-01 for a YYYY-MM-DD key, independent of time zone and DST. */
export function dayNumber(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}
function keyFromDayNumber(n: number) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}
/** The date `days` after (or before) a YYYY-MM-DD key. */
export function shiftDate(key: string, days: number) {
  return keyFromDayNumber(dayNumber(key) + days);
}
/** Whole days from one YYYY-MM-DD key to another. */
export function daysBetween(from: string, to: string) {
  return dayNumber(to) - dayNumber(from);
}
export const eventSchema = z
  .object({
    id,
    title: short,
    date: dateSchema,
    start: time,
    end: time,
    memberIds: z.array(id).min(1),
    location: z.string().max(200),
    notes: z.string().max(2000),
    repeat: z.enum(repeats),
    category: z.enum([
      "Activity",
      "School",
      "Appointment",
      "Family time",
      "Work",
    ]),
    // Optional so families saved before these existed stay valid.
    /** Last day of a multi-day event; absent for single-day events. */
    endDate: dateSchema.optional(),
    /** Last day a repeating event may start on; absent repeats forever. */
    until: dateSchema.optional(),
    allDay: z.boolean().optional(),
    /** Map position of the location, when it was picked from search results. */
    place: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
      })
      .optional(),
  })
  .superRefine((e, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    const span = e.endDate ? dayNumber(e.endDate) - dayNumber(e.date) : 0;
    if (span < 0) issue("endDate", "End date can’t be before the start date");
    // Overnight and all-day events may end at an earlier clock time.
    if (span === 0 && !e.allDay && e.end <= e.start)
      issue(
        "end",
        e.endDate
          ? "End time must be after start time, or choose a later end date"
          : "End time must be after start time",
      );
    if (e.until && e.until < e.date)
      issue("until", "The repeat can’t end before the event starts");
    if (e.repeat !== "none" && span >= repeatInterval[e.repeat])
      issue(
        "endDate",
        `An event that repeats ${repeatLabels[e.repeat].toLowerCase()} can last at most ${repeatInterval[e.repeat]} days`,
      );
  });
export const taskSchema = z.object({
  id,
  title: short,
  memberId: id,
  due: dateSchema,
  done: z.boolean(),
  priority: z.enum(["normal", "high"]),
});
export const shoppingSchema = z.object({
  id,
  name: short,
  quantity: z.string().max(50),
  category: z.enum(categories),
  done: z.boolean(),
});
export const mealSchema = z.object({
  id,
  date: dateSchema,
  slot: z.enum(["Breakfast", "Lunch", "Dinner"]),
  recipeId: id,
});
export const noteSchema = z.object({
  id,
  title: short,
  body: z.string().trim().min(1).max(2000),
  memberId: id,
  color: z.enum(colors),
  pinned: z.boolean(),
  createdAt: z.string().datetime(),
});
export const settingsSchema = z.object({
  familyName: short,
  currentMemberId: id,
  weekStartsMonday: z.boolean(),
});
export const dataSchema = z
  .object({
    version: z.literal(1),
    settings: settingsSchema,
    members: z.array(memberSchema).min(1).max(30),
    events: z.array(eventSchema).max(5000),
    tasks: z.array(taskSchema).max(5000),
    shopping: z.array(shoppingSchema).max(5000),
    meals: z.array(mealSchema).max(5000),
    notes: z.array(noteSchema).max(5000),
  })
  .superRefine((data, ctx) => {
    const members = new Set(data.members.map((m) => m.id));
    if (!members.has(data.settings.currentMemberId))
      ctx.addIssue({
        code: "custom",
        message: "The selected family member is missing",
      });
    for (const list of [
      data.members,
      data.events,
      data.tasks,
      data.shopping,
      data.meals,
      data.notes,
    ]) {
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({
          code: "custom",
          message: "Duplicate item IDs in backup",
        });
    }
    if (
      data.events.some((e) => e.memberIds.some((m) => !members.has(m))) ||
      data.tasks.some((t) => !members.has(t.memberId)) ||
      data.notes.some((n) => !members.has(n.memberId))
    )
      ctx.addIssue({
        code: "custom",
        message: "An item refers to a missing family member",
      });
    if (data.meals.some((m) => !recipes.some((r) => r.id === m.recipeId)))
      ctx.addIssue({ code: "custom", message: "An unknown recipe was found" });
    if (
      new Set(data.meals.map((m) => `${m.date}:${m.slot}`)).size !==
      data.meals.length
    )
      ctx.addIssue({
        code: "custom",
        message: "A meal slot cannot have two recipes",
      });
  });
export type Member = z.infer<typeof memberSchema>;
export type FamilyEvent = z.infer<typeof eventSchema>;
export type Task = z.infer<typeof taskSchema>;
export type ShoppingItem = z.infer<typeof shoppingSchema>;
export type Meal = z.infer<typeof mealSchema>;
export type Note = z.infer<typeof noteSchema>;
export type PlannerData = z.infer<typeof dataSchema>;
export type Collection =
  "members" | "events" | "tasks" | "shopping" | "meals" | "notes";
export type RecordItem =
  Member | FamilyEvent | Task | ShoppingItem | Meal | Note;
export type Mutation =
  | { collection: Collection; action: "upsert"; value: RecordItem }
  | { collection: Collection; action: "remove"; id: string }
  | {
      collection: "settings";
      action: "settings";
      value: PlannerData["settings"];
    };
export type Recipe = {
  id: string;
  name: string;
  subtitle: string;
  time: number;
  servings: number;
  category: string;
  image: string;
  color: string;
  ingredients: {
    name: string;
    quantity: string;
    category: ShoppingItem["category"];
  }[];
  steps: string[];
};

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function fromKey(date: string) {
  return new Date(date + "T12:00:00");
}
export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
export function startOfWeek(date: Date, monday = true) {
  return addDays(date, -((date.getDay() + (monday ? 6 : 0)) % 7));
}
export function formatDate(
  date: Date | string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
) {
  return new Intl.DateTimeFormat("en-NZ", options).format(
    typeof date === "string" ? fromKey(date) : date,
  );
}
export function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""}${h >= 12 ? " pm" : " am"}`;
}
/** Whether an occurrence of the event begins on `day`. */
export function startsOn(event: FamilyEvent, day: string) {
  if (day < event.date || (event.until && day > event.until)) return false;
  const diff = dayNumber(day) - dayNumber(event.date);
  switch (event.repeat) {
    case "none":
      return diff === 0;
    case "weekly":
      return diff % 7 === 0;
    case "fortnightly":
      return diff % 14 === 0;
    // Months without that day (e.g. the 31st) and non-leap years for 29 Feb are skipped.
    case "monthly":
      return day.slice(8) === event.date.slice(8);
    case "yearly":
      return day.slice(5) === event.date.slice(5);
  }
}
export type Occurrence = { start: string; end: string };
/** The occurrence of the event that covers `day`, with its first and last date. */
export function occurrenceOn(
  event: FamilyEvent,
  day: string,
): Occurrence | null {
  if (day < event.date) return null;
  const last = event.endDate ?? event.date;
  if (event.repeat === "none")
    return day <= last ? { start: event.date, end: last } : null;
  // A repeating event is shorter than its interval, so at most one occurrence covers the day.
  const span = dayNumber(last) - dayNumber(event.date);
  const n = dayNumber(day);
  for (let offset = 0; offset <= span; offset++) {
    const start = keyFromDayNumber(n - offset);
    if (startsOn(event, start))
      return { start, end: keyFromDayNumber(n - offset + span) };
  }
  return null;
}
export function occursOn(event: FamilyEvent, day: string) {
  return occurrenceOn(event, day) !== null;
}
/** A short time label for the event on a given day, e.g. "9 am", "From 6 pm" or "Day 2 of 3". */
export function occurrenceLabel(event: FamilyEvent, day: string) {
  const occurrence = occurrenceOn(event, day);
  if (!occurrence || occurrence.start === occurrence.end)
    return event.allDay ? "All day" : formatTime(event.start);
  if (!event.allDay && day === occurrence.start)
    return `From ${formatTime(event.start)}`;
  if (!event.allDay && day === occurrence.end)
    return `Until ${formatTime(event.end)}`;
  const index = dayNumber(day) - dayNumber(occurrence.start) + 1;
  const length = dayNumber(occurrence.end) - dayNumber(occurrence.start) + 1;
  return `Day ${index} of ${length}`;
}
export const isMultiDay = (event: FamilyEvent) =>
  Boolean(event.endDate && event.endDate !== event.date);
export function eventsOn(data: PlannerData, day: string, member = "all") {
  return data.events
    .filter(
      (e) =>
        occursOn(e, day) && (member === "all" || e.memberIds.includes(member)),
    )
    .sort(
      (a, b) =>
        Number(!a.allDay && !isMultiDay(a)) -
          Number(!b.allDay && !isMultiDay(b)) || a.start.localeCompare(b.start),
    );
}
export function uid() {
  return crypto.randomUUID();
}
export function applyMutation(
  data: PlannerData,
  mutation: Mutation,
): PlannerData {
  if (mutation.action === "settings")
    return { ...data, settings: mutation.value };
  const list = data[mutation.collection] as RecordItem[];
  if (mutation.action === "remove")
    return {
      ...data,
      [mutation.collection]: list.filter((x) => x.id !== mutation.id),
    };
  const filtered =
    mutation.collection === "meals"
      ? list.filter(
          (x) =>
            x.id === mutation.value.id ||
            (x as Meal).date !== (mutation.value as Meal).date ||
            (x as Meal).slot !== (mutation.value as Meal).slot,
        )
      : list;
  const exists = filtered.some((x) => x.id === mutation.value.id);
  return {
    ...data,
    [mutation.collection]: exists
      ? filtered.map((x) => (x.id === mutation.value.id ? mutation.value : x))
      : [...filtered, mutation.value],
  };
}
/** Items that would be left without anyone if this member were removed. */
export function ownedBy(data: PlannerData, memberId: string) {
  return {
    events: data.events.filter(
      (e) => e.memberIds.length === 1 && e.memberIds[0] === memberId,
    ),
    tasks: data.tasks.filter((t) => t.memberId === memberId),
    notes: data.notes.filter((n) => n.memberId === memberId),
  };
}
/**
 * Removes a member as one batch. Their chores, notes and events only they were in
 * move to `heirId`; shared events simply drop them.
 */
export function removeMemberChanges(
  data: PlannerData,
  memberId: string,
  heirId: string,
): Mutation[] {
  const changes: Mutation[] = [];
  for (const event of data.events) {
    if (!event.memberIds.includes(memberId)) continue;
    const others = event.memberIds.filter((id) => id !== memberId);
    changes.push({
      collection: "events",
      action: "upsert",
      value: { ...event, memberIds: others.length ? others : [heirId] },
    });
  }
  for (const task of data.tasks)
    if (task.memberId === memberId)
      changes.push({
        collection: "tasks",
        action: "upsert",
        value: { ...task, memberId: heirId },
      });
  for (const note of data.notes)
    if (note.memberId === memberId)
      changes.push({
        collection: "notes",
        action: "upsert",
        value: { ...note, memberId: heirId },
      });
  if (data.settings.currentMemberId === memberId)
    changes.push({
      collection: "settings",
      action: "settings",
      value: { ...data.settings, currentMemberId: heirId },
    });
  changes.push({ collection: "members", action: "remove", id: memberId });
  return changes;
}
export function ingredientsToShopping(
  data: PlannerData,
  recipeIds: string[],
): ShoppingItem[] {
  const existing = new Set(
    data.shopping
      .filter((x) => !x.done)
      .map((x) => x.name.toLowerCase().trim()),
  );
  const result: ShoppingItem[] = [];
  for (const recipeId of new Set(recipeIds)) {
    const recipe = recipes.find((r) => r.id === recipeId);
    for (const ingredient of recipe?.ingredients ?? []) {
      const key = ingredient.name.toLowerCase().trim();
      if (!existing.has(key)) {
        result.push({ ...ingredient, id: uid(), done: false });
        existing.add(key);
      }
    }
  }
  return result;
}

export const recipes: Recipe[] = [
  {
    id: "pasta",
    name: "Creamy tomato pasta",
    subtitle: "A little comfort in every forkful.",
    time: 25,
    servings: 4,
    category: "Vegetarian",
    color: "peach",
    image: "/images/pasta.jpg",
    ingredients: [
      { name: "Penne pasta", quantity: "400 g", category: "Pantry" },
      { name: "Cherry tomatoes", quantity: "400 g", category: "Produce" },
      { name: "Cream", quantity: "150 ml", category: "Dairy & eggs" },
      { name: "Fresh basil", quantity: "1 bunch", category: "Produce" },
      { name: "Parmesan", quantity: "50 g", category: "Dairy & eggs" },
      { name: "Garlic", quantity: "3 cloves", category: "Produce" },
    ],
    steps: [
      "Bring a large pot of salted water to the boil. Cook the pasta according to the packet, reserving a mug of pasta water before draining.",
      "Warm a little olive oil in a large pan. Add the chopped garlic and halved tomatoes. Cook for 8–10 minutes until the tomatoes soften.",
      "Stir in the cream and a splash of pasta water. Simmer for 2 minutes, then toss in the pasta.",
      "Fold in torn basil and grated parmesan. Season to taste and serve warm.",
    ],
  },
  {
    id: "tacos",
    name: "Build-your-own tacos",
    subtitle: "Everyone gets to make their favourite.",
    time: 30,
    servings: 4,
    category: "Family favourite",
    color: "yellow",
    image: "/images/tacos.jpg",
    ingredients: [
      { name: "Tortillas", quantity: "8", category: "Bakery" },
      { name: "Black beans", quantity: "2 cans", category: "Pantry" },
      { name: "Avocados", quantity: "2", category: "Produce" },
      { name: "Tomatoes", quantity: "3", category: "Produce" },
      { name: "Limes", quantity: "2", category: "Produce" },
      { name: "Cheddar cheese", quantity: "100 g", category: "Dairy & eggs" },
    ],
    steps: [
      "Drain the beans and warm in a saucepan with a splash of water, cumin, paprika and a pinch of salt for 10 minutes.",
      "Dice the tomatoes and avocado. Grate the cheese and cut the limes into wedges.",
      "Warm the tortillas in a dry frying pan for 30 seconds on each side.",
      "Put everything in bowls on the table and let everyone assemble their tacos.",
    ],
  },
  {
    id: "salmon",
    name: "Lemon & herb salmon",
    subtitle: "One tray. Happy plates. Less washing up.",
    time: 35,
    servings: 4,
    category: "One-pan wonder",
    color: "sage",
    image: "/images/salmon.jpg",
    ingredients: [
      { name: "Salmon fillets", quantity: "4", category: "Meat & fish" },
      { name: "Baby potatoes", quantity: "600 g", category: "Produce" },
      { name: "Broccoli", quantity: "1 head", category: "Produce" },
      { name: "Lemons", quantity: "2", category: "Produce" },
      { name: "Fresh dill", quantity: "1 bunch", category: "Produce" },
    ],
    steps: [
      "Heat the oven to 200°C. Halve the baby potatoes, toss with oil and salt, and roast on a lined tray for 15 minutes.",
      "Add the salmon and broccoli florets to the tray. Drizzle with olive oil and lemon juice.",
      "Roast for another 12–15 minutes, until the salmon reaches 63°C in the thickest part.",
      "Scatter over fresh dill and serve with lemon wedges.",
    ],
  },
  {
    id: "curry",
    name: "Golden chickpea curry",
    subtitle: "Cosy, colourful and full of good things.",
    time: 30,
    servings: 4,
    category: "Plant-based",
    color: "yellow",
    image: "/images/curry.jpg",
    ingredients: [
      { name: "Chickpeas", quantity: "2 cans", category: "Pantry" },
      { name: "Coconut milk", quantity: "1 can", category: "Pantry" },
      { name: "Baby spinach", quantity: "120 g", category: "Produce" },
      { name: "Basmati rice", quantity: "300 g", category: "Pantry" },
      { name: "Curry paste", quantity: "2 tbsp", category: "Pantry" },
      { name: "Onions", quantity: "1", category: "Produce" },
    ],
    steps: [
      "Cook the rice according to the packet instructions.",
      "Soften the chopped onion in a little oil for 5 minutes, then stir in curry paste and cook for 1 minute.",
      "Add drained chickpeas and coconut milk. Simmer gently for 15 minutes.",
      "Stir in the spinach until wilted. Taste, season, and serve over fluffy rice.",
    ],
  },
  {
    id: "pizza",
    name: "Friday night pizza",
    subtitle: "Flour on the counter. Smiles all around.",
    time: 25,
    servings: 4,
    category: "Family favourite",
    color: "rose",
    image: "/images/pizza.jpg",
    ingredients: [
      { name: "Pizza bases", quantity: "2 large", category: "Bakery" },
      { name: "Passata", quantity: "200 ml", category: "Pantry" },
      { name: "Mozzarella", quantity: "200 g", category: "Dairy & eggs" },
      { name: "Peppers", quantity: "2", category: "Produce" },
      { name: "Mushrooms", quantity: "150 g", category: "Produce" },
    ],
    steps: [
      "Heat the oven to 220°C with a baking tray inside.",
      "Spread passata over the pizza bases, leaving a small border.",
      "Top with mozzarella and thinly sliced vegetables. Let everyone decorate their own half.",
      "Bake on the hot tray for 12–15 minutes until the cheese is bubbling and the edges are crisp.",
    ],
  },
  {
    id: "pancakes",
    name: "Fluffy weekend pancakes",
    subtitle: "For slow mornings and second helpings.",
    time: 20,
    servings: 4,
    category: "Breakfast",
    color: "peach",
    image: "/images/pancakes.jpg",
    ingredients: [
      { name: "Plain flour", quantity: "200 g", category: "Pantry" },
      { name: "Eggs", quantity: "2", category: "Dairy & eggs" },
      { name: "Milk", quantity: "250 ml", category: "Dairy & eggs" },
      { name: "Baking powder", quantity: "2 tsp", category: "Pantry" },
      { name: "Mixed berries", quantity: "200 g", category: "Produce" },
      { name: "Maple syrup", quantity: "to serve", category: "Pantry" },
    ],
    steps: [
      "Mix the flour and baking powder in a large bowl. Whisk the eggs and milk together, then stir into the dry ingredients.",
      "Heat a non-stick pan over medium heat with a little butter.",
      "Pour small rounds of batter into the pan. Cook until bubbles appear, then flip and cook the other side for 1–2 minutes, until cooked through.",
      "Stack up and top with berries and a drizzle of maple syrup.",
    ],
  },
];

export function createFamily(name: string, familyName: string): PlannerData {
  const id = uid();
  return {
    version: 1,
    settings: { familyName, currentMemberId: id, weekStartsMonday: true },
    members: [{ id, name, role: "Parent", color: "lavender", emoji: "🌻" }],
    events: [],
    tasks: [],
    shopping: [],
    meals: [],
    notes: [],
  };
}
export function createSeed(today = new Date()): PlannerData {
  const day = (n: number) => dateKey(addDays(today, n));
  return {
    version: 1,
    settings: {
      familyName: "The Miller family",
      currentMemberId: "alex",
      weekStartsMonday: true,
    },
    members: [
      {
        id: "alex",
        name: "Alex",
        role: "Parent",
        color: "lavender",
        emoji: "🌻",
      },
      {
        id: "jamie",
        name: "Jamie",
        role: "Parent",
        color: "sage",
        emoji: "🌿",
      },
      {
        id: "oliver",
        name: "Oliver",
        role: "Kid",
        color: "peach",
        emoji: "🦊",
      },
      { id: "sophie", name: "Sophie", role: "Kid", color: "blue", emoji: "🦋" },
    ],
    events: [
      {
        id: "e1",
        title: "School drop-off",
        date: day(0),
        start: "08:30",
        end: "09:00",
        memberIds: ["jamie", "oliver", "sophie"],
        location: "Oakwood Primary",
        notes: "Remember the library books!",
        repeat: "none",
        category: "School",
      },
      {
        id: "e2",
        title: "Football practice",
        date: day(0),
        start: "16:00",
        end: "17:00",
        memberIds: ["oliver", "alex"],
        location: "Riverside Park",
        notes: "Bring boots, a water bottle and a snack.",
        repeat: "weekly",
        category: "Activity",
      },
      {
        id: "e3",
        title: "Family dinner",
        date: day(0),
        start: "18:30",
        end: "19:15",
        memberIds: ["alex", "jamie", "oliver", "sophie"],
        location: "Home, sweet home",
        notes: "Phones away, good stories encouraged.",
        repeat: "none",
        category: "Family time",
      },
      {
        id: "e4",
        title: "Piano lesson",
        date: day(1),
        start: "15:30",
        end: "16:15",
        memberIds: ["sophie", "jamie"],
        location: "Music with Anna",
        notes: "Bring the new music book.",
        repeat: "weekly",
        category: "Activity",
      },
      {
        id: "e5",
        title: "Coffee & catch-up",
        date: day(2),
        start: "10:00",
        end: "11:00",
        memberIds: ["alex", "jamie"],
        location: "The Little Corner Café",
        notes: "A little time for us.",
        repeat: "none",
        category: "Family time",
      },
      {
        id: "e6",
        title: "Library adventure",
        date: day(3),
        start: "15:30",
        end: "16:30",
        memberIds: ["jamie", "oliver", "sophie"],
        location: "Town Library",
        notes: "Find a new bedtime read.",
        repeat: "none",
        category: "Activity",
      },
      {
        id: "e7",
        title: "Movie & pizza night",
        date: day(4),
        start: "18:00",
        end: "20:00",
        memberIds: ["alex", "jamie", "oliver", "sophie"],
        location: "Our living room",
        notes: "Sophie gets to choose the movie this week.",
        repeat: "none",
        category: "Family time",
      },
      {
        id: "e8",
        title: "Farmers market",
        date: day(5),
        start: "09:00",
        end: "10:30",
        memberIds: ["alex", "jamie"],
        location: "Town Square",
        notes: "Take the reusable bags.",
        repeat: "none",
        category: "Activity",
      },
    ],
    tasks: [
      {
        id: "t1",
        title: "Pack school bags",
        memberId: "oliver",
        due: day(0),
        done: true,
        priority: "normal",
      },
      {
        id: "t2",
        title: "Water our plant friends",
        memberId: "sophie",
        due: day(0),
        done: false,
        priority: "normal",
      },
      {
        id: "t3",
        title: "Pick up the groceries",
        memberId: "jamie",
        due: day(0),
        done: false,
        priority: "high",
      },
      {
        id: "t4",
        title: "Put away the laundry",
        memberId: "alex",
        due: day(0),
        done: false,
        priority: "normal",
      },
      {
        id: "t5",
        title: "Feed & walk Buddy",
        memberId: "oliver",
        due: day(0),
        done: false,
        priority: "normal",
      },
      {
        id: "t6",
        title: "Return library books",
        memberId: "alex",
        due: day(2),
        done: false,
        priority: "normal",
      },
    ],
    shopping: [
      {
        id: "s1",
        name: "Avocados",
        quantity: "2",
        category: "Produce",
        done: false,
      },
      {
        id: "s2",
        name: "Bananas",
        quantity: "1 bunch",
        category: "Produce",
        done: false,
      },
      {
        id: "s3",
        name: "Cherry tomatoes",
        quantity: "400 g",
        category: "Produce",
        done: false,
      },
      {
        id: "s4",
        name: "Baby spinach",
        quantity: "1 bag",
        category: "Produce",
        done: false,
      },
      {
        id: "s5",
        name: "Milk",
        quantity: "2 L",
        category: "Dairy & eggs",
        done: false,
      },
      {
        id: "s6",
        name: "Eggs",
        quantity: "12",
        category: "Dairy & eggs",
        done: false,
      },
      {
        id: "s7",
        name: "Greek yoghurt",
        quantity: "500 g",
        category: "Dairy & eggs",
        done: false,
      },
      {
        id: "s8",
        name: "Sourdough bread",
        quantity: "1 loaf",
        category: "Bakery",
        done: false,
      },
      {
        id: "s9",
        name: "Penne pasta",
        quantity: "400 g",
        category: "Pantry",
        done: false,
      },
      {
        id: "s10",
        name: "Peanut butter",
        quantity: "1 jar",
        category: "Pantry",
        done: false,
      },
      {
        id: "s11",
        name: "Oat crackers",
        quantity: "1 box",
        category: "Pantry",
        done: false,
      },
      {
        id: "s12",
        name: "Dish soap",
        quantity: "1 bottle",
        category: "Household",
        done: false,
      },
    ],
    meals: ["pasta", "tacos", "salmon", "curry", "pizza", "pancakes"].map(
      (recipeId, i) => ({
        id: `m${i}`,
        date: day(i),
        slot: i === 5 ? "Breakfast" : "Dinner",
        recipeId,
      }),
    ),
    notes: [
      {
        id: "n1",
        title: "A little weekend adventure? 🌿",
        body: "Let’s pack a picnic and explore the botanical gardens this Saturday. Who’s in? Sandwich requests welcome!",
        memberId: "jamie",
        color: "yellow",
        pinned: true,
        createdAt: today.toISOString(),
      },
      {
        id: "n2",
        title: "You’ve got this, team 💜",
        body: "Big or small, every little thing you do helps our home feel like home. Thanks for being my favourite people.",
        memberId: "alex",
        color: "lavender",
        pinned: false,
        createdAt: today.toISOString(),
      },
    ],
  };
}
