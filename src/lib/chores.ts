import {
  dateKey,
  dayNumber,
  shiftDate,
  startOfWeek,
  uid,
  type Mutation,
  type PlannerData,
  type Task,
} from "./data";

/** A thank-you that notices finishing touches: someone's last chore, or everyone's. */
export function cheer(
  tasks: { id: string; memberId: string; done: boolean }[],
  completed: { id: string; memberId: string },
  name: string,
) {
  const left = tasks.filter((t) => !t.done && t.id !== completed.id);
  if (left.length === 0) return "Every chore is done. Brilliant teamwork! 🎉";
  if (!left.some((t) => t.memberId === completed.memberId))
    return `${name} has finished all their chores! ⭐`;
  return `Done. Thanks, ${name}!`;
}

type Repeat = NonNullable<Task["repeat"]>;
const daysInMonth = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
function step(due: string, repeat: Repeat, day: number) {
  if (repeat === "daily") return shiftDate(due, 1);
  if (repeat === "weekly") return shiftDate(due, 7);
  if (repeat === "fortnightly") return shiftDate(due, 14);
  // Monthly: the chore's day next month, or its last day when shorter (31 Jan → 28 Feb).
  const [y, m] = due.split("-").map(Number);
  const next = `${m === 12 ? y + 1 : y}-${String((m % 12) + 1).padStart(2, "0")}`;
  return `${next}-${String(Math.min(day, daysInMonth(`${next}-01`))).padStart(2, "0")}`;
}
/**
 * The next due date after `today`, keeping the chore's rhythm (bins stay on Tuesdays).
 * Monthly chores keep to `day` of the month, so 31 Jan → 28 Feb → 31 Mar.
 */
export function nextDue(
  due: string,
  repeat: Repeat,
  today: string,
  day = Number(due.slice(8)),
) {
  let next = step(due, repeat, day);
  while (next <= today) next = step(next, repeat, day);
  return next;
}
/**
 * The day of the month a monthly chore keeps to. A short month moves one
 * occurrence to its last day; the occurrence before still shows the real day.
 */
function monthDay(data: PlannerData, task: Task) {
  const day = Number(task.due.slice(8));
  if (!task.series || day < daysInMonth(task.due)) return day;
  const previous = data.tasks
    .filter((t) => t.series === task.series && t.due < task.due)
    .sort((a, b) => b.due.localeCompare(a.due))[0];
  return previous ? Math.max(day, Number(previous.due.slice(8))) : day;
}
/** Who does the next one: the next person in the turn order, or the same person. */
export function nextInTurn(task: Pick<Task, "memberId" | "rotation">) {
  if (!task.rotation?.length) return task.memberId;
  const at = task.rotation.indexOf(task.memberId);
  return task.rotation[(at + 1) % task.rotation.length];
}
/** Ticking a chore off; a repeating one also schedules its next occurrence. */
export function completeChore(
  data: PlannerData,
  task: Task,
  now = new Date(),
): Mutation[] {
  const series = task.repeat ? (task.series ?? task.id) : task.series;
  const changes: Mutation[] = [
    {
      collection: "tasks",
      action: "upsert",
      value: {
        ...task,
        ...(series ? { series } : {}),
        done: true,
        doneAt: now.toISOString(),
      },
    },
  ];
  if (!task.repeat) return changes;
  // Ticked, unticked and ticked again: the next one is already scheduled.
  const scheduled = data.tasks.some(
    (t) =>
      t.series === series && t.id !== task.id && !t.done && t.due > task.due,
  );
  if (!scheduled)
    changes.push({
      collection: "tasks",
      action: "upsert",
      value: {
        id: uid(),
        title: task.title,
        priority: task.priority,
        repeat: task.repeat,
        ...(task.rotation ? { rotation: task.rotation } : {}),
        series: series!,
        memberId: nextInTurn(task),
        due: nextDue(
          task.due,
          task.repeat,
          dateKey(now),
          task.repeat === "monthly" ? monthDay(data, task) : undefined,
        ),
        done: false,
      },
    });
  return changes;
}
/** Unticking a chore; for a repeating one, its scheduled next occurrence goes too. */
export function reopenChore(data: PlannerData, task: Task): Mutation[] {
  const { doneAt: _doneAt, ...rest } = task;
  void _doneAt;
  const changes: Mutation[] = [
    { collection: "tasks", action: "upsert", value: { ...rest, done: false } },
  ];
  const next = data.tasks
    .filter(
      (t) =>
        task.series &&
        t.series === task.series &&
        t.id !== task.id &&
        !t.done &&
        t.due > task.due,
    )
    .sort((a, b) => a.due.localeCompare(b.due))[0];
  if (next)
    changes.push({ collection: "tasks", action: "remove", id: next.id });
  return changes;
}
/**
 * Ticks a chore off or reopens it, worked out from the latest plans when the
 * change is saved. A quick second tap then does nothing, instead of scheduling
 * the next occurrence twice.
 */
export function setChoreDone(taskId: string, done: boolean, now = new Date()) {
  return (data: PlannerData): Mutation[] => {
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task || task.done === done) return [];
    return done ? completeChore(data, task, now) : reopenChore(data, task);
  };
}
/** Stars this week: one for each chore a person finished. */
export function starsThisWeek(
  data: PlannerData,
  now = new Date(),
): Record<string, number> {
  const start = dayNumber(
    dateKey(startOfWeek(now, data.settings.weekStartsMonday)),
  );
  const stars: Record<string, number> = {};
  for (const task of data.tasks) {
    if (!task.done || !task.doneAt) continue;
    const day = dayNumber(dateKey(new Date(task.doneAt))) - start;
    if (day >= 0 && day < 7)
      stars[task.memberId] = (stars[task.memberId] ?? 0) + 1;
  }
  return stars;
}
